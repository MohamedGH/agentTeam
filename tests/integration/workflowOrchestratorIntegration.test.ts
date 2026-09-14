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

export async function runWorkflowOrchestratorIntegrationTests() {
  console.log('\n====================================================');
  console.log('🔗 WORKFLOW ORCHESTRATOR INTEGRATION TESTS (Hermetic)');
  console.log('====================================================\n');

  const testDataDir = path.join(process.cwd(), 'data', 'test_workflow_integration');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  // -------------------------------------------------------------
  // TEST 1: Full Asynchronous Lifecycle via Background Poller
  // -------------------------------------------------------------
  {
    console.log('Integration Test 1: Background Poller autonomously advances RUNNING -> COMPLETED with full Git delivery');
    const testSessionFile = path.join(testDataDir, 'test_poller_async.json');
    const sessionStore = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent = new MockCodingAgent(sessionStore);
    
    // Start session in QUEUED
    mockAgent.setMockSession({
      state: 'QUEUED',
      resultSummary: 'Session initialized in queue',
    });

    const codingAgentManager = new CodingAgentManager({
      sessionStore,
      julesAgent: mockAgent as any,
      mockAgent,
    });

    let gitProcessed = false;
    const mockGithubClient = new GitHubClient({
      token: 'mock-gh-token',
      fetchFn: async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 55,
          html_url: 'https://github.com/MohamedGH/agentTeam/pull/55',
          number: 55,
          sha: 'git_commit_sha_55',
          ref: 'refs/heads/jules/task-55',
        }),
        text: async () => 'ok',
      }),
    });

    const githubManager = new GitHubManager(mockGithubClient);
    githubManager.processTaskResult = async (opts: any) => {
      gitProcessed = true;
      return {
        success: true,
        commitSha: 'git_commit_sha_55',
        commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/git_commit_sha_55',
        pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/55',
        testsPassed: true,
        git: {
          committed: true,
          pushed: true,
          branch: opts.branch,
          commitSha: 'git_commit_sha_55',
          commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/git_commit_sha_55',
          pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/55',
        },
      };
    };

    const orchestrator = new WorkflowOrchestrator({
      codingAgentManager,
      sessionStore,
      githubManager,
      providerManager: new ProviderManager({ registerDefaults: false }),
      workspace: new VirtualWorkspace(),
      pollIntervalMs: 50, // fast polling for tests
    });

    const workflow = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Async background orchestrator integration test',
      commitPushAndCreatePR: true,
    });

    assert.strictEqual(workflow.stage, 'JULES_RUNNING');
    assert.strictEqual(workflow.executionStatus, 'RUNNING');
    assert.strictEqual(gitProcessed, false, 'Git must not be processed yet');

    // Simulate Jules making progressive activities and then completing in cloud
    setTimeout(() => {
      mockAgent.setMockSession({
        state: 'IN_PROGRESS',
        resultSummary: 'Implementing code changes',
      });
    }, 80);

    setTimeout(() => {
      mockAgent.setMockSession({
        state: 'COMPLETED',
        resultSummary: 'All code generated and verified in cloud',
        prUrl: 'https://github.com/MohamedGH/agentTeam/pull/55',
        gitBranch: 'jules/task-55',
      });
    }, 160);

    // Wait for poller to automatically detect completion and execute downstream pipeline
    let resolved = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const current = await orchestrator.getWorkflow(workflow.sessionId);
      if (current?.stage === 'COMPLETED') {
        resolved = true;
        assert.strictEqual(current.executionStatus, 'COMPLETED');
        assert.strictEqual(current.status, 'COMPLETED');
        assert.strictEqual(gitProcessed, true, 'Git processing must be completed');
        assert.strictEqual(current.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/55');
        assert.strictEqual(current.testsPassed, true);
        assert.ok(current.finalReport, 'Final report must exist');
        break;
      }
    }

    orchestrator.stopBackgroundPoller();
    assert.ok(resolved, 'Background poller must advance workflow to COMPLETED without manual intervention');
    console.log('✅ PASS: Background poller successfully advanced workflow asynchronously');
  }

  // -------------------------------------------------------------
  // TEST 2: Server Reboot Recovery in Integration Setting
  // -------------------------------------------------------------
  {
    console.log('\nIntegration Test 2: Multi-session reboot recovery');
    const testSessionFile = path.join(testDataDir, 'test_multi_reboot.json');
    const store = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent = new MockCodingAgent(store);
    const codingAgentManager = new CodingAgentManager({ sessionStore: store, mockAgent });

    const orch1 = new WorkflowOrchestrator({ codingAgentManager, sessionStore: store });

    // Start 2 concurrent workflows
    const wf1 = await orch1.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Task A pending',
    });

    const wf2 = await orch1.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Task B pending',
    });

    orch1.stopBackgroundPoller();

    // Reboot: create new instance from same persisted store
    const storeRebooted = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgentRebooted = new MockCodingAgent(storeRebooted);
    const camRebooted = new CodingAgentManager({ sessionStore: storeRebooted, mockAgent: mockAgentRebooted });
    const orchRebooted = new WorkflowOrchestrator({
      codingAgentManager: camRebooted,
      sessionStore: storeRebooted,
      pollIntervalMs: 50,
    });

    const resumed = await orchRebooted.resumeAllActiveWorkflows();
    assert.strictEqual(resumed.length, 2, 'Both pending workflows must be resumed on reboot');

    orchRebooted.stopBackgroundPoller();
    console.log('✅ PASS: Multi-session recovery across reboot verified');
  }

  // Cleanup
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL WORKFLOW ORCHESTRATOR INTEGRATION TESTS PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('workflowOrchestratorIntegration')) {
  runWorkflowOrchestratorIntegrationTests().catch((err) => {
    console.error('WorkflowOrchestrator integration test failed:', err);
    process.exit(1);
  });
}
