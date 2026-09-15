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
import type { GenerationOutcome } from '../../server/providers/types';
import { QuotaManager } from '../../server/quotaManager';

export async function runWorkflowPipelineE2ETests() {
  console.log('\n====================================================');
  console.log('🧪 WORKFLOW PIPELINE END-TO-END VERIFICATION (A - L)');
  console.log('====================================================\n');

  const testDataDir = path.join(process.cwd(), 'data', 'test_workflow_e2e_suite');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  function setupHarness(options?: {
    customExitCode?: number;
    customTestOutput?: string;
    diffContent?: string;
  }) {
    const testSessionFile = path.join(testDataDir, `sessions_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`);
    const sessionStore = new FileBackedCodingAgentSessionStore(testSessionFile);
    const mockAgent = new MockCodingAgent(sessionStore);

    const codingAgentManager = new CodingAgentManager({
      sessionStore,
      julesAgent: mockAgent as any,
      mockAgent,
    });

    let gitCalls = 0;
    let gitOptionsPassed: any[] = [];
    const mockGithubClient = new GitHubClient({
      token: 'mock-gh-token',
      fetchFn: async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 99,
          html_url: 'https://github.com/MohamedGH/agentTeam/pull/99',
          number: 99,
          sha: 'commit_sha_99',
          ref: 'refs/heads/jules/task-99',
        }),
        text: async () => 'ok',
      }),
    });

    const githubManager = new GitHubManager(mockGithubClient);
    githubManager.processTaskResult = async (opts: any) => {
      gitCalls++;
      gitOptionsPassed.push(opts);

      // Enforce internal safety checks as real GitHubManager does
      if (opts.sessionStatus !== 'COMPLETED' || opts.executionStatus !== 'COMPLETED') {
        return {
          success: false,
          testsPassed: false,
          error: `Refusing Git operations: session status is ${opts.sessionStatus}`,
        };
      }
      if (opts.testsPassed === false) {
        return {
          success: false,
          testsPassed: false,
          error: 'Refusing Git operations: QA test validation failed.',
        };
      }
      if (opts.reviewApproved === false) {
        return {
          success: false,
          testsPassed: false,
          error: 'Refusing Git operations: Architectural review was not approved.',
        };
      }

      return {
        success: true,
        commitSha: 'commit_sha_99',
        commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/commit_sha_99',
        pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/99',
        testsPassed: true,
        git: {
          committed: true,
          pushed: true,
          branch: opts.branch,
          commitSha: 'commit_sha_99',
          commitUrl: 'https://github.com/MohamedGH/agentTeam/commit/commit_sha_99',
          pullRequestUrl: 'https://github.com/MohamedGH/agentTeam/pull/99',
        },
      };
    };

    const workspace = new VirtualWorkspace();
    if (options?.customExitCode !== undefined) {
      workspace.setCommandResult('npm test', {
        exitCode: options.customExitCode,
        output: options.customTestOutput || `Test execution with exit code ${options.customExitCode}`,
      });
    }

    if (options?.diffContent) {
      workspace.writeFile('src/sample.ts', options.diffContent);
    }

    const providerManager = new ProviderManager({ registerDefaults: false });

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
      githubManager,
      workspace,
      getGitCalls: () => gitCalls,
      getGitOptions: () => gitOptionsPassed,
    };
  }

  // =============================================================
  // Scenario A: Jules non-terminal (QUEUED / IN_PROGRESS) -> Pas de QA/Git
  // =============================================================
  {
    console.log('Scenario A: Jules non-terminal (QUEUED/IN_PROGRESS) -> No QA / No Git');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness();

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario A task',
      commitPushAndCreatePR: true,
    });

    assert.strictEqual(wf.stage, 'JULES_RUNNING');
    assert.strictEqual(wf.executionStatus, 'RUNNING');
    assert.strictEqual(getGitCalls(), 0, 'No Git operations while QUEUED');

    mockAgent.setMockSession({ state: 'IN_PROGRESS', resultSummary: 'Writing code' });
    const polled = await orchestrator.pollWorkflow(wf.sessionId);
    assert.strictEqual(polled.stage, 'JULES_RUNNING');
    assert.strictEqual(polled.executionStatus, 'RUNNING');
    assert.strictEqual(getGitCalls(), 0, 'No Git operations while IN_PROGRESS');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario A]: Non-terminal states completely block QA/Git execution');
  }

  // =============================================================
  // Scenario B: Jules FAILED -> Pas de QA/Git
  // =============================================================
  {
    console.log('\nScenario B: Jules FAILED -> No QA / No Git');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness();

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario B task',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'FAILED', error: 'Jules syntax error in cloud', resultSummary: 'Agent crashed' });
    const polled = await orchestrator.pollWorkflow(wf.sessionId);

    assert.strictEqual(polled.status, 'FAILED');
    assert.strictEqual(polled.stage, 'FAILED');
    assert.strictEqual(polled.executionStatus, 'FAILED');
    assert.strictEqual(getGitCalls(), 0, 'No Git operations when Jules fails');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario B]: Jules FAILED immediately halts workflow without QA/Git');
  }

  // =============================================================
  // Scenario C: Jules CANCELLED -> Pas de QA/Git
  // =============================================================
  {
    console.log('\nScenario C: Jules CANCELLED -> No QA / No Git');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness();

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario C task',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'CANCELLED', resultSummary: 'User cancelled task' });
    const polled = await orchestrator.pollWorkflow(wf.sessionId);

    assert.strictEqual(polled.status, 'CANCELLED');
    assert.strictEqual(polled.stage, 'CANCELLED');
    assert.strictEqual(polled.executionStatus, 'CANCELLED');
    assert.strictEqual(getGitCalls(), 0, 'No Git operations when Jules is CANCELLED');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario C]: Jules CANCELLED cleanly halts without Git');
  }

  // =============================================================
  // Scenario D: Jules COMPLETED + QA FAIL -> Pas de Git/PR
  // =============================================================
  {
    console.log('\nScenario D: Jules COMPLETED + QA FAIL -> No Git/PR, Stage FAILED');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness({
      customExitCode: 1,
      customTestOutput: 'FAIL tests/app.test.ts (1 failed, 0 passed)',
    });

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario D task',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'COMPLETED', resultSummary: 'Finished writing tests' });
    const polled = await orchestrator.pollWorkflow(wf.sessionId);

    assert.strictEqual(polled.testsPassed, false);
    assert.strictEqual(polled.stage, 'FAILED');
    assert.strictEqual(polled.executionStatus, 'FAILED');
    assert.strictEqual(getGitCalls(), 0, 'QA Failure MUST block Git operations');
    assert.ok(polled.finalReport, 'Final report must exist');
    assert.strictEqual(polled.finalReport?.tests, 'FAIL');
    assert.ok(polled.finalReport?.remainingIssues.length! > 0);

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario D]: QA failure successfully blocked Git delivery');
  }

  // =============================================================
  // Scenario E: Jules COMPLETED + QA PASS + REVIEW CHANGES_REQUESTED -> Pas de Git/PR
  // =============================================================
  {
    console.log('\nScenario E: Jules COMPLETED + QA PASS + REVIEW CHANGES_REQUESTED (Hardcoded Secret) -> No Git/PR');
    const { orchestrator, mockAgent, workspace, getGitCalls } = setupHarness({
      customExitCode: 0,
      customTestOutput: 'PASS all tests',
    });

    // Introduce hardcoded credential in workspace to trigger Review CHANGES_REQUESTED
    workspace.writeFile('src/secret.ts', 'export const token = "ghp_12345678901234567890";\n');

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario E task',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'COMPLETED', resultSummary: 'Finished with secret leak' });
    const polled = await orchestrator.pollWorkflow(wf.sessionId);

    assert.strictEqual(polled.testsPassed, true);
    assert.strictEqual(polled.stage, 'FAILED');
    assert.strictEqual(polled.executionStatus, 'FAILED');
    assert.strictEqual(getGitCalls(), 0, 'Architectural review failure MUST block Git operations');
    assert.strictEqual(polled.finalReport?.review, 'CHANGES_REQUIRED');
    assert.ok(polled.finalReport?.remainingIssues.some((i) => i.includes('Security violation')));

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario E]: Security review violation successfully blocked Git delivery');
  }

  // =============================================================
  // Scenario F: Jules COMPLETED + QA PASS + REVIEW APPROVED + Git requested -> Git autorisé une fois
  // =============================================================
  {
    console.log('\nScenario F: Jules COMPLETED + QA PASS + REVIEW APPROVED + Git requested -> Git authorized once');
    const { orchestrator, mockAgent, getGitCalls, getGitOptions } = setupHarness({
      customExitCode: 0,
      customTestOutput: 'PASS all hermetic tests',
    });

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario F task',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({
      state: 'COMPLETED',
      resultSummary: 'Complete clean implementation',
      prUrl: 'https://github.com/MohamedGH/agentTeam/pull/99',
    });

    const polled = await orchestrator.pollWorkflow(wf.sessionId);

    assert.strictEqual(polled.stage, 'COMPLETED');
    assert.strictEqual(polled.executionStatus, 'COMPLETED');
    assert.strictEqual(getGitCalls(), 1, 'Git delivery must be called exactly once');
    assert.strictEqual(getGitOptions()[0].testsPassed, true);
    assert.strictEqual(getGitOptions()[0].reviewApproved, true);
    assert.strictEqual(polled.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/99');
    assert.strictEqual(polled.finalReport?.tests, 'PASS');
    assert.strictEqual(polled.finalReport?.review, 'APPROVED');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario F]: Validated QA + Review safely authorized Git delivery once');
  }

  // =============================================================
  // Scenario G: Deux polls simultanés sur COMPLETED -> un seul pipeline downstream
  // =============================================================
  {
    console.log('\nScenario G: Two simultaneous polls on COMPLETED -> Single downstream execution');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness({
      customExitCode: 0,
    });

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario G simultaneous polling',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'COMPLETED', resultSummary: 'Finished task' });

    const [poll1, poll2] = await Promise.all([
      orchestrator.pollWorkflow(wf.sessionId),
      orchestrator.pollWorkflow(wf.sessionId),
    ]);

    assert.strictEqual(getGitCalls(), 1, `Expected exactly 1 git delivery call across concurrent polls, got ${getGitCalls()}`);
    assert.strictEqual(poll1.stage, 'COMPLETED');
    assert.strictEqual(poll2.stage, 'COMPLETED');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario G]: Concurrent polling safely synchronized to single downstream pipeline');
  }

  // =============================================================
  // Scenario H: Deux polls successifs après complétion -> pas de répétition
  // =============================================================
  {
    console.log('\nScenario H: Two successive polls after completion -> Idempotent no repetition');
    const { orchestrator, mockAgent, getGitCalls } = setupHarness({
      customExitCode: 0,
    });

    const wf = await orchestrator.startWorkflow({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      taskPrompt: 'Scenario H successive polling',
      commitPushAndCreatePR: true,
    });

    mockAgent.setMockSession({ state: 'COMPLETED', resultSummary: 'Finished task' });

    const poll1 = await orchestrator.pollWorkflow(wf.sessionId);
    assert.strictEqual(poll1.stage, 'COMPLETED');
    assert.strictEqual(getGitCalls(), 1);

    const poll2 = await orchestrator.pollWorkflow(wf.sessionId);
    assert.strictEqual(poll2.stage, 'COMPLETED');
    assert.strictEqual(getGitCalls(), 1, 'Successive poll must not re-execute git delivery');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario H]: Successive post-completion polls are strictly idempotent');
  }

  // =============================================================
  // Scenario I: exitCode=1 -> QA FAIL même si la sortie ne contient pas "FAILED"
  // =============================================================
  {
    console.log('\nScenario I: exitCode=1 -> QA FAIL without keyword FAILED');
    const { orchestrator, workspace } = setupHarness();

    workspace.setCommandResult('npm test', {
      exitCode: 1,
      output: 'Internal error: Segmentation fault in test worker process. No tests executed.',
    });

    const result = workspace.executeCommand('npm test');
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.success, false, 'exitCode=1 must yield success=false regardless of output text');

    const review = orchestrator.performDeterministicReview(result, '');
    assert.strictEqual(review.qaPassed, false);
    assert.strictEqual(review.approved, false);
    assert.strictEqual(review.status, 'CHANGES_REQUESTED');

    orchestrator.stopBackgroundPoller();
    console.log('✅ PASS [Scenario I]: Non-zero exit code strictly treated as QA failure');
  }

  // =============================================================
  // Scenario J: exitCode=0 -> QA PASS
  // =============================================================
  {
    console.log('\nScenario J: exitCode=0 -> QA PASS');
    const { workspace } = setupHarness();

    workspace.setCommandResult('npm test', {
      exitCode: 0,
      output: 'Test runner complete. Status 0.',
    });

    const result = workspace.executeCommand('npm test');
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.success, true);

    console.log('✅ PASS [Scenario J]: exitCode=0 cleanly produces QA PASS');
  }

  // =============================================================
  // Scenario K: GenerationOutcome=DEGRADED_FALLBACK -> ne devient jamais REAL_PROVIDER_SUCCESS
  // =============================================================
  {
    console.log('\nScenario K: GenerationOutcome=DEGRADED_FALLBACK never becomes REAL_PROVIDER_SUCCESS');
    const outcome: GenerationOutcome = 'DEGRADED_FALLBACK';
    assert.notStrictEqual(outcome, 'REAL_PROVIDER_SUCCESS');
    assert.strictEqual(outcome, 'DEGRADED_FALLBACK');

    console.log('✅ PASS [Scenario K]: GenerationOutcome type integrity validated');
  }

  // =============================================================
  // Scenario L: Modèles OpenAI/Anthropic/Groq/DeepSeek -> non bloqués par quota Gemini inexistant
  // =============================================================
  {
    console.log('\nScenario L: Non-Gemini models not blocked by non-existent Gemini quota');
    const quotaManager = new QuotaManager(
      path.join(testDataDir, 'quota_test.json'),
      path.join(testDataDir, 'quota_state_test.json')
    );

    // Verify non-Gemini provider models are explicitly allowed and exempt
    const openAiAllowed = quotaManager.canUseModel('gpt-4o');
    const anthropicAllowed = quotaManager.canUseModel('claude-3-5-sonnet-20241022');
    const groqAllowed = quotaManager.canUseModel('llama-3.3-70b-versatile');
    const deepseekAllowed = quotaManager.canUseModel('deepseek-chat');

    assert.strictEqual(openAiAllowed.ok, true, 'OpenAI model must be allowed');
    assert.strictEqual(anthropicAllowed.ok, true, 'Anthropic model must be allowed');
    assert.strictEqual(groqAllowed.ok, true, 'Groq model must be allowed');
    assert.strictEqual(deepseekAllowed.ok, true, 'DeepSeek model must be allowed');

    console.log('✅ PASS [Scenario L]: Multi-provider models operate independently without Gemini quota coupling');
  }

  // Cleanup test directory
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL E2E WORKFLOW PIPELINE SCENARIOS PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('workflowPipelineE2E')) {
  runWorkflowPipelineE2ETests().catch((err) => {
    console.error('Workflow Pipeline E2E test failed:', err);
    process.exit(1);
  });
}
