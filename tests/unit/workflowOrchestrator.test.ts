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

  // -------------------------------------------------------------
  // TEST 6: Concurrency Coalescing (inFlightPolls guard)
  // -------------------------------------------------------------
  {
    console.log('\nTest 6: Concurrency coalescing prevents duplicate concurrent pollWorkflow calls');
    const { orchestrator, codingAgentManager } = setupTestHarness();

    let getSessionCount = 0;
    const origGetSession = codingAgentManager.getSession.bind(codingAgentManager);
    codingAgentManager.getSession = async (sessionId: string, agentId?: string) => {
      getSessionCount++;
      // Delay slightly to ensure concurrent calls overlap
      await new Promise((resolve) => setTimeout(resolve, 50));
      return origGetSession(sessionId, agentId);
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Test concurrency coalescing',
    });

    // Fire 5 concurrent polls simultaneously using both sessionId and workflowId
    const [p1, p2, p3, p4, p5] = await Promise.all([
      orchestrator.pollWorkflow(workflow.sessionId),
      orchestrator.pollWorkflow(workflow.workflowId),
      orchestrator.pollWorkflow(workflow.sessionId),
      orchestrator.pollWorkflow(workflow.workflowId),
      orchestrator.pollWorkflow(workflow.sessionId),
    ]);

    // All should return identical results and getSession should only have been called once for this poll wave
    assert.strictEqual(p1.status, p2.status);
    assert.strictEqual(p2.status, p3.status);
    assert.strictEqual(getSessionCount, 1, `Expected 1 call to getSession due to coalescing, got ${getSessionCount}`);
    console.log('✅ PASS: Concurrent polling calls cleanly coalesced');
  }

  // -------------------------------------------------------------
  // TEST 7: Single Downstream Execution Owner (Exact-Once Guarantee)
  // -------------------------------------------------------------
  {
    console.log('\nTest 7: Downstream verification & delivery executes EXACTLY ONCE');
    const { orchestrator, mockAgent, githubManager } = setupTestHarness();

    let githubDeliveryCount = 0;
    githubManager.processTaskResult = async () => {
      githubDeliveryCount++;
      return {
        success: true,
        commitSha: 'commit_test_123',
        pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/99',
      };
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Ensure downstream executes once',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Finished initial coding pass',
    });

    // First completion poll
    const firstPoll = await orchestrator.pollWorkflow(workflow.sessionId);
    assert.strictEqual(firstPoll.stage, 'COMPLETED');
    assert.strictEqual(firstPoll.downstreamExecuted, true);
    assert.strictEqual(githubDeliveryCount, 1, 'GitHub delivery must run once on initial completion');

    // Attempt second poll or direct handleJulesCompleted invocation
    const secondPoll = await orchestrator.pollWorkflow(workflow.sessionId);
    assert.strictEqual(githubDeliveryCount, 1, 'GitHub delivery must NOT run a second time');
    assert.strictEqual(secondPoll.downstreamExecuted, true);

    const directCall = await orchestrator.handleJulesCompleted(firstPoll, null);
    assert.strictEqual(githubDeliveryCount, 1, 'Direct call to handleJulesCompleted must NOT run downstream a second time');
    assert.strictEqual(directCall.downstreamExecuted, true);

    console.log('✅ PASS: Downstream execution strictly guaranteed exactly once');
  }

  // -------------------------------------------------------------
  // TEST 8: Workflow ID & Session ID bi-directional resolution
  // -------------------------------------------------------------
  {
    console.log('\nTest 8: Workflow ID and Session ID resolve to same state');
    const { orchestrator, sessionStore } = setupTestHarness();

    const customWorkflowId = 'wf_custom_test_identity_999';
    const workflow = await orchestrator.startWorkflow({
      workflowId: customWorkflowId,
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Identity resolution test',
    });

    assert.strictEqual(workflow.workflowId, customWorkflowId);

    // Retrieve via workflowId
    const stateByWf = await orchestrator.getWorkflow(customWorkflowId);
    assert.ok(stateByWf);
    assert.strictEqual(stateByWf.sessionId, workflow.sessionId);

    // Retrieve via sessionId
    const stateBySession = await orchestrator.getWorkflow(workflow.sessionId);
    assert.ok(stateBySession);
    assert.strictEqual(stateBySession.workflowId, customWorkflowId);

    // Retrieve via sessionStore directly by workflowId
    const storedByWf = await sessionStore.getSession(customWorkflowId);
    assert.ok(storedByWf);
    assert.strictEqual(storedByWf.sessionId, workflow.sessionId);

    console.log('✅ PASS: Both workflowId and sessionId reliably resolve the same workflow state');
  }

  // -------------------------------------------------------------
  // TEST 9: Real QA failure blocks successful completion and delivery
  // -------------------------------------------------------------
  {
    console.log('\nTest 9: Real QA failure blocks successful completion and requires changes');
    const { orchestrator, mockAgent, workspace, githubManager } = setupTestHarness();

    // Configure test failure in workspace
    workspace.setCommandResult('npm test', {
      exitCode: 1,
      output: 'FAIL tests/auth.test.ts\n● Auth validator › invalid token rejected\nAssertionError: expected false to be true',
      success: false,
    });

    githubManager.processTaskResult = async () => ({
      success: true,
      commitSha: 'commit_qa_fail',
      pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/101',
      testsPassed: true,
    });

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Implement token validator with test verification',
      testCommand: 'npm test',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Code generated with a failing unit test',
    });

    const resultState = await orchestrator.pollWorkflow(workflow.sessionId);

    assert.strictEqual(resultState.stage, 'FAILED');
    assert.strictEqual(resultState.executionStatus, 'FAILED');
    assert.strictEqual(resultState.testsPassed, false, 'testsPassed must be false when QA fails');
    assert.ok(resultState.finalReport, 'finalReport must be generated');
    assert.strictEqual(resultState.finalReport.tests, 'FAIL', 'finalReport.tests must be FAIL');
    assert.strictEqual(resultState.finalReport.review, 'CHANGES_REQUIRED', 'Review must be CHANGES_REQUIRED when tests fail');
    assert.ok(resultState.finalReport.remainingIssues.some((issue) => issue.includes('Automated QA test suite failed') || issue.includes('QA test validation failed')));

    console.log('✅ PASS: Real QA failure correctly marked in tests and final report');
  }

  // -------------------------------------------------------------
  // TEST 10: Strict Refusal of Git/PR operations when session is not COMPLETED
  // -------------------------------------------------------------
  {
    console.log('\nTest 10: Strict refusal of Git/PR operations if Jules is not COMPLETED');
    const { githubManager, orchestrator } = setupTestHarness();

    // 1. Direct call to githubManager.processTaskResult with non-COMPLETED sessionStatus
    const nonCompletedRes = await githubManager.processTaskResult({
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      sessionId: 'sess_running_123',
      sessionStatus: 'IN_PROGRESS',
      executionStatus: 'RUNNING',
    });

    assert.strictEqual(nonCompletedRes.success, false);
    assert.ok(nonCompletedRes.error?.includes('Refusing Git operations'));
    assert.ok(nonCompletedRes.error?.includes('IN_PROGRESS'));

    // 2. Direct call with sessionStatus FAILED
    const failedRes = await githubManager.processTaskResult({
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      sessionId: 'sess_failed_123',
      sessionStatus: 'FAILED',
      executionStatus: 'FAILED',
    });
    assert.strictEqual(failedRes.success, false);
    assert.ok(failedRes.error?.includes('Refusing Git operations'));

    // 3. Ensure handleJulesCompleted aborts if state is not COMPLETED
    const dummyState: any = {
      sessionId: 'sess_abort_test',
      workflowId: 'wf_abort_test',
      status: 'IN_PROGRESS',
      stage: 'JULES_RUNNING',
      downstreamExecuted: false,
      downstreamExecuting: false,
      options: {},
      steps: [],
    };
    const abortResult = await orchestrator.handleJulesCompleted(dummyState, null);
    assert.strictEqual(abortResult.downstreamExecuted, false, 'Must not execute downstream when status != COMPLETED');

    console.log('✅ PASS: Git operations strictly refused when session is not COMPLETED');
  }

  // -------------------------------------------------------------
  // TEST 11: Deterministic Reviewer based on gitDiff and test outcome
  // -------------------------------------------------------------
  {
    console.log('\nTest 11: Deterministic Reviewer evaluates gitDiff security and QA test results');
    const { orchestrator, workspace } = setupTestHarness();

    // Case A: Passed test + clean diff -> APPROVED
    const passedTestResult = {
      exitCode: 0,
      stdout: 'All 15 tests passed',
      stderr: '',
      success: true,
      output: 'All 15 tests passed',
    };
    const cleanReview = orchestrator.performDeterministicReview(passedTestResult, 'src/auth.ts\nsrc/utils.ts');
    assert.strictEqual(cleanReview.approved, true);
    assert.strictEqual(cleanReview.status, 'APPROVED');
    assert.strictEqual(cleanReview.securityIssues.length, 0);

    // Case B: Security leak detected in diff -> CHANGES_REQUESTED
    const leakyDiff = '+++ b/src/config.ts\n+const apiKey = "ghp_xxxxxxxxxxxxxxxxxxxx";';
    const leakedReview = orchestrator.performDeterministicReview(passedTestResult, leakyDiff);
    assert.strictEqual(leakedReview.approved, false);
    assert.strictEqual(leakedReview.status, 'CHANGES_REQUESTED');
    assert.ok(leakedReview.securityIssues.some((issue) => issue.includes('Hardcoded credential')));

    // Case C: Failed QA test -> CHANGES_REQUESTED
    const failedTestResult = {
      exitCode: 1,
      stdout: '',
      stderr: 'AssertionError: test failed',
      success: false,
      output: 'AssertionError: test failed',
    };
    const failedQaReview = orchestrator.performDeterministicReview(failedTestResult, 'src/auth.ts');
    assert.strictEqual(failedQaReview.approved, false);
    assert.strictEqual(failedQaReview.status, 'CHANGES_REQUESTED');
    assert.ok(failedQaReview.qaPassed === false);

    console.log('✅ PASS: Deterministic Reviewer accurately identifies security violations and QA failures');
  }

  // -------------------------------------------------------------
  // TEST 12: Double-poll simultaneity does not duplicate downstream delivery
  // -------------------------------------------------------------
  {
    console.log('\nTest 12: Double-poll simultaneity does not duplicate downstream delivery');
    const { orchestrator, mockAgent, githubManager } = setupTestHarness();

    let gitDeliveryCalls = 0;
    githubManager.processTaskResult = async () => {
      gitDeliveryCalls++;
      // Simulate slight network delay to test concurrency window
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        success: true,
        commitSha: 'commit_concurrent_123',
        pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/777',
      };
    };

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Double poll concurrency test',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Finished implementation',
    });

    // Fire 2 simultaneous polls on the same newly completed session
    const [res1, res2] = await Promise.all([
      orchestrator.pollWorkflow(workflow.sessionId),
      orchestrator.pollWorkflow(workflow.sessionId),
    ]);

    assert.strictEqual(gitDeliveryCalls, 1, `Expected exactly 1 git delivery call, got ${gitDeliveryCalls}`);
    assert.strictEqual(res1.stage, 'COMPLETED');
    assert.strictEqual(res2.stage, 'COMPLETED');
    assert.strictEqual(res1.downstreamExecuted, true);
    assert.strictEqual(res2.downstreamExecuted, true);

    console.log('✅ PASS: Double-poll concurrency window prevented duplicate downstream delivery');
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
