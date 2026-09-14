import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { WorkflowOrchestrator } from '../../server/workflowOrchestrator';
import { CodingAgentManager } from '../../server/codingAgents/codingAgentManager';
import { MockCodingAgent } from '../../server/codingAgents/mockCodingAgent';
import { FileBackedCodingAgentSessionStore } from '../../server/codingAgents/sessionStore';
import { GitHubManager } from '../../server/github/githubManager';
import { GitHubClient } from '../../server/github/githubClient';
import { ProviderManager } from '../../server/providerManager';
import { VirtualWorkspace } from '../../server/virtualWorkspace';
import { JulesSession } from '../../server/codingAgents/types';

export async function runWorkflowOrchestratorUnitTests() {
  console.log('\n====================================================');
  console.log('⚙️ WORKFLOW ORCHESTRATOR UNIT TESTS (Hermetic)');
  console.log('====================================================\n');

  const testDataDir = path.join(process.cwd(), 'data', 'test_workflow_store');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  function setupTestHarness(customMockState?: Partial<JulesSession>) {
    const testSessionFile = path.join(testDataDir, `test_sessions_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
    const sessionStore = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent = new MockCodingAgent(sessionStore);
    
    // Configurable mock agent
    if (customMockState) {
      mockAgent.setMockSession(customMockState);
    }

    const codingAgentManager = new CodingAgentManager({
      sessionStore,
      julesAgent: mockAgent as any,
      mockAgent,
    });

    const mockGithubClient = new GitHubClient({
      token: 'mock-gh-token',
      fetchFn: async (url: string, opts?: any) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 101,
            html_url: 'https://github.com/MohamedGH/agentTeam/pull/42',
            number: 42,
            sha: 'abcdef1234567890',
            ref: 'refs/heads/main',
            commit: { message: 'test commit' },
          }),
          text: async () => 'ok',
        };
      },
    });

    const githubManager = new GitHubManager(mockGithubClient);
    const providerManager = new ProviderManager({ registerDefaults: false });
    const workspace = new VirtualWorkspace();

    const orchestrator = new WorkflowOrchestrator({
      codingAgentManager,
      sessionStore,
      githubManager,
      providerManager,
      workspace,
      pollIntervalMs: 100,
    });

    return {
      orchestrator,
      sessionStore,
      mockAgent,
      codingAgentManager,
      githubManager,
      workspace,
    };
  }

  // -------------------------------------------------------------
  // TEST 1: startWorkflow creates asynchronous RUNNING workflow and persists it
  // -------------------------------------------------------------
  {
    console.log('Test 1: startWorkflow initializes asynchronous RUNNING workflow');
    const { orchestrator, sessionStore } = setupTestHarness();

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Implement async orchestrator pipeline',
      automationMode: 'AUTO_CREATE_PR',
    });

    assert.ok(workflow.workflowId, 'workflowId must be generated');
    assert.ok(workflow.sessionId, 'sessionId must be generated');
    assert.strictEqual(workflow.stage, 'JULES_RUNNING');
    assert.strictEqual(workflow.status, 'QUEUED');
    assert.strictEqual(workflow.executionStatus, 'RUNNING');
    assert.strictEqual(workflow.steps.length, 2, 'Initial steps must contain architect & developer steps');

    // Verify durable storage
    const stored = await sessionStore.getSession(workflow.sessionId);
    assert.ok(stored, 'Session must exist in durable store');
    assert.ok(stored?.workflowState, 'workflowState must be persisted');
    assert.strictEqual(stored?.workflowState?.status, 'QUEUED');

    console.log('✅ PASS: startWorkflow successfully initialized and persisted');
  }

  // -------------------------------------------------------------
  // TEST 2: Absence of Git/PR push before COMPLETED
  // -------------------------------------------------------------
  {
    console.log('\nTest 2: Absence of Git/PR push while session is RUNNING (QUEUED/IN_PROGRESS)');
    const { orchestrator, githubManager } = setupTestHarness();

    let gitProcessTaskResultCalled = false;
    githubManager.processTaskResult = async () => {
      gitProcessTaskResultCalled = true;
      return { success: true, testsPassed: true };
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Testing no premature git push',
      commitAndPush: true,
      commitPushAndCreatePR: true,
    });

    // Poll while still QUEUED
    const polled1 = await orchestrator.pollWorkflow(workflow.sessionId);
    assert.strictEqual(polled1.status, 'QUEUED');
    assert.strictEqual(polled1.stage, 'JULES_RUNNING');
    assert.strictEqual(gitProcessTaskResultCalled, false, 'Git workflow MUST NOT be called while QUEUED');

    console.log('✅ PASS: Zero Git/PR operations performed during non-terminal states');
  }

  // -------------------------------------------------------------
  // TEST 3: RUNNING -> COMPLETED with full downstream pipeline (Git, QA, Review, Final Report)
  // -------------------------------------------------------------
  {
    console.log('\nTest 3: RUNNING -> COMPLETED triggers full downstream pipeline');
    const { orchestrator, mockAgent, githubManager } = setupTestHarness();

    let gitCalled = false;
    githubManager.processTaskResult = async (opts: any) => {
      gitCalled = true;
      return {
        success: true,
        commitSha: 'commit_sha_999',
        commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/commit_sha_999',
        pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/42',
        testsPassed: true,
        git: {
          committed: true,
          pushed: true,
          branch: opts.branch,
          commitSha: 'commit_sha_999',
          commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/commit_sha_999',
          pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/42',
        },
      };
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Implement JWT auth token validator',
      commitPushAndCreatePR: true,
    });

    // Transition mock session to COMPLETED
    mockAgent.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Completed JWT validator implementation',
      prUrl: 'https://github.com/MohamedGH/agentTeam/pull/42',
      gitBranch: 'mock/task-jwt',
    });

    // Poll to trigger handleJulesCompleted
    const completedState = await orchestrator.pollWorkflow(workflow.sessionId);

    assert.strictEqual(completedState.stage, 'COMPLETED');
    assert.strictEqual(completedState.status, 'COMPLETED');
    assert.strictEqual(completedState.executionStatus, 'COMPLETED');
    assert.strictEqual(gitCalled, true, 'Git processing must be invoked upon COMPLETED');
    assert.strictEqual(completedState.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/42');
    assert.strictEqual(completedState.commitSha, 'commit_sha_999');
    assert.strictEqual(completedState.testsPassed, true);
    assert.ok(completedState.finalReport, 'Final report must be generated');
    assert.strictEqual(completedState.finalReport.implementation, 'PASS');
    assert.strictEqual(completedState.finalReport.review, 'APPROVED');

    // Verify steps contain git, tester, reviewer, and manager phases
    const phases = completedState.steps.map((s) => s.phase);
    assert.ok(phases.includes(6), 'Steps must include Phase 6 GitHub workflow');
    assert.ok(phases.includes(3), 'Steps must include Phase 3 Testing');
    assert.ok(phases.includes(5), 'Steps must include Phase 5 Architectural Review');
    assert.ok(phases.includes(7), 'Steps must include Phase 7 Final Delivery');

    console.log('✅ PASS: Full downstream verification executed cleanly after Jules COMPLETED');
  }

  // -------------------------------------------------------------
  // TEST 4: RUNNING -> FAILED skips Git/PR and downstream stages
  // -------------------------------------------------------------
  {
    console.log('\nTest 4: RUNNING -> FAILED skips Git/PR and marks workflow FAILED');
    const { orchestrator, mockAgent, githubManager, sessionStore } = setupTestHarness();

    let gitCalled = false;
    githubManager.processTaskResult = async () => {
      gitCalled = true;
      return { success: true };
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Failing task test',
      commitPushAndCreatePR: true,
    });

    // Fail mock session
    mockAgent.setMockSession({
      state: 'FAILED',
      resultSummary: 'Fatal syntax error in generated module',
    });

    const failedState = await orchestrator.pollWorkflow(workflow.sessionId);

    assert.strictEqual(failedState.stage, 'FAILED');
    assert.strictEqual(failedState.status, 'FAILED');
    assert.strictEqual(failedState.executionStatus, 'FAILED');
    assert.strictEqual(gitCalled, false, 'Git workflow MUST NEVER be called on FAILED session');
    assert.ok(failedState.error?.includes('Fatal syntax error'));
    assert.strictEqual(failedState.finalReport?.tests, 'SKIPPED');
    assert.strictEqual(failedState.finalReport?.review, 'SKIPPED');

    // Verify persisted state is FAILED
    const stored = await sessionStore.getSession(workflow.sessionId);
    assert.strictEqual(stored?.workflowState?.stage, 'FAILED');

    console.log('✅ PASS: Failed session handled safely with zero Git actions and skipped downstream gates');
  }

  // -------------------------------------------------------------
  // TEST 5: Server Restart Recovery (resumeAllActiveWorkflows)
  // -------------------------------------------------------------
  {
    console.log('\nTest 5: Server reboot recovery (resumeAllActiveWorkflows)');
    
    // Step 1: Create session file and orchestrator 1, start a RUNNING workflow
    const testSessionFile = path.join(testDataDir, 'test_reboot_recovery.json');
    const store1 = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent1 = new MockCodingAgent(store1);
    const codingAgentManager1 = new CodingAgentManager({ sessionStore: store1, mockAgent: mockAgent1 });
    const orchestrator1 = new WorkflowOrchestrator({ codingAgentManager: codingAgentManager1, sessionStore: store1 });

    const wf1 = await orchestrator1.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Long running task spanning server reboot',
    });
    assert.strictEqual(wf1.status, 'QUEUED');

    // Simulate server shutdown
    orchestrator1.stopBackgroundPoller();

    // Step 2: Fresh reboot (orchestrator 2 pointing to the same durable store file)
    const store2 = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent2 = new MockCodingAgent(store2);
    const codingAgentManager2 = new CodingAgentManager({ sessionStore: store2, mockAgent: mockAgent2 });
    const orchestrator2 = new WorkflowOrchestrator({ codingAgentManager: codingAgentManager2, sessionStore: store2 });

    const activeList = await store2.listActiveWorkflows();
    assert.strictEqual(activeList.length, 1, 'Store must report 1 active workflow');

    // Resume all workflows across reboot
    const resumed = await orchestrator2.resumeAllActiveWorkflows();
    assert.strictEqual(resumed.length, 1, 'Must recover 1 active workflow');
    assert.strictEqual(resumed[0].sessionId, wf1.sessionId);
    assert.strictEqual(resumed[0].stage, 'JULES_RUNNING');

    // Now mock completes while orchestrator 2 is monitoring
    mockAgent2.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Completed after server reboot',
    });

    const finalAfterReboot = await orchestrator2.pollWorkflow(wf1.sessionId);
    assert.strictEqual(finalAfterReboot.stage, 'COMPLETED');
    assert.strictEqual(finalAfterReboot.executionStatus, 'COMPLETED');

    orchestrator2.stopBackgroundPoller();
    console.log('✅ PASS: Server restart recovery successfully resumed and drove workflow to completion');
  }

  // Cleanup test directory
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL WORKFLOW ORCHESTRATOR UNIT TESTS PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('workflowOrchestrator')) {
  runWorkflowOrchestratorUnitTests().catch((err) => {
    console.error('WorkflowOrchestrator unit test failed:', err);
    process.exit(1);
  });
}
