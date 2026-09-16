import assert from 'assert';
import { codingAgentManager } from '../../server/codingAgents/codingAgentManager';
import { agentTeamEngine } from '../../server/agentTeam';
import { GitHubManager } from '../../server/github/githubManager';
import { GitHubClient } from '../../server/github/githubClient';
import { GitHubRepository } from '../../server/github/githubRepository';
import { GitHubPullRequest } from '../../server/github/githubPullRequest';
import { GitHubGitOperations } from '../../server/github/githubGitOperations';

export async function runGitHubWorkflowIntegrationTests() {
  console.log('\n--- [Integration Test] Jules -> Git Commit -> Push -> GitHub PR Pipeline ---');

  // 1. Missing GITHUB_TOKEN handling
  const originalGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;

  // Re-instantiate default GitHubManager without token
  (codingAgentManager as any).githubManager = new GitHubManager(new GitHubClient({ token: '' }));

  // Unconfigured test
  const missingTokenResult = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Implement GitHub workflow',
    commitAndPush: true,
  });

  assert.strictEqual(missingTokenResult.success, false);
  assert.strictEqual(missingTokenResult.error, 'GITHUB_TOKEN is not configured');
  console.log('✅ PASS: codingAgentManager.execute gracefully rejects git operations when GITHUB_TOKEN is missing');

  // 2. Setup mock GitHub environment
  const mockToken = 'ghp_mock_token_for_integration_testing_12345';
  process.env.GITHUB_TOKEN = mockToken;

  const mockGitOps = new GitHubGitOperations();
  mockGitOps.runVerificationTests = async () => ({ passed: true, output: '100% tests passed' });
  mockGitOps.getStatus = async () => ({
    hasChanges: true,
    modifiedFiles: ['server/github/index.ts', 'server/github/types.ts'],
    addedFiles: [],
    deletedFiles: [],
    untrackedFiles: [],
    currentBranch: 'main',
  });
  mockGitOps.commitChanges = async (opts) => ({
    committed: true,
    commitSha: '9f8e7d6c5b4a3210',
    commitMessage: opts.message,
    filesCommitted: ['server/github/index.ts', 'server/github/types.ts'],
  });
  mockGitOps.pushBranch = async (opts) => ({
    pushed: true,
    branch: opts.branch,
    commitSha: '9f8e7d6c5b4a3210',
    commitUrl: `https://github.com/${opts.owner}/${opts.repo}/commit/9f8e7d6c5b4a3210`,
  });

  const mockClient = new GitHubClient({ token: mockToken });
  const mockPR = new GitHubPullRequest(mockClient);
  mockPR.createPullRequest = async (owner, repo, opts) => ({
    id: 555,
    number: 555,
    title: opts.title,
    html_url: `https://github.com/${owner}/${repo}/pull/555`,
    state: 'open',
    head: { ref: opts.head },
    base: { ref: opts.base },
  });

  const mockRepo = new GitHubRepository(mockClient);
  mockRepo.ensureRepository = async (opts) => ({
    name: 'agentTeam',
    full_name: opts.repository,
    private: false,
    default_branch: 'main',
    html_url: `https://github.com/${opts.repository}`,
  });

  const testGitHubManager = new GitHubManager(
    mockClient,
    mockGitOps,
    mockRepo,
    mockPR
  );

  // Inject test GitHubManager into CodingAgentManager
  (codingAgentManager as any).githubManager = testGitHubManager;

  // 3a. Test Unverified Review Safety: codingAgentManager blocks Git mutation when reviewApproved is undefined
  const unreviewedResult = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Enhance automated GitHub deployment for Jules agent without review',
    commitPushAndCreatePR: true,
    // reviewApproved is undefined
  });

  assert.strictEqual(unreviewedResult.success, false);
  assert.strictEqual(unreviewedResult.commitSha, undefined);
  assert.strictEqual(unreviewedResult.pullRequestUrl, undefined);
  assert.ok(unreviewedResult.error?.includes('reviewApproved must strictly be true'));
  console.log('✅ PASS: codingAgentManager blocks Git mutation when reviewApproved is undefined');

  // 3b. Test Jules -> Modification -> Commit -> Push -> PR Workflow with explicit review approval
  const fullWorkflowResult = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Enhance automated GitHub deployment for Jules agent',
    commitPushAndCreatePR: true,
    reviewApproved: true,
  });

  assert.strictEqual(fullWorkflowResult.success, true);
  assert.strictEqual(fullWorkflowResult.status, 'COMPLETED');
  assert.strictEqual(fullWorkflowResult.commitSha, '9f8e7d6c5b4a3210');
  assert.ok(fullWorkflowResult.commitUrl?.includes('commit/9f8e7d6c5b4a3210'));
  assert.strictEqual(fullWorkflowResult.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/555');
  assert.strictEqual(fullWorkflowResult.testsPassed, true);
  assert.ok(fullWorkflowResult.git?.committed);
  assert.ok(fullWorkflowResult.git?.pushed);
  assert.strictEqual(fullWorkflowResult.git?.branch, 'main');
  console.log('✅ PASS: codingAgentManager successfully executes full Jules -> Git Commit -> Push -> PR flow when review is approved');

  // 4. Test Safety Constraint: Do NOT push if critical tests fail
  const failingGitOps = new GitHubGitOperations();
  failingGitOps.runVerificationTests = async () => ({ passed: false, output: 'AssertionError: 2 failures in test suite' });

  const safetyGitHubManager = new GitHubManager(
    mockClient,
    failingGitOps,
    mockRepo,
    mockPR
  );
  (codingAgentManager as any).githubManager = safetyGitHubManager;

  const blockedWorkflowResult = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Risky refactoring that breaks test suite',
    commitAndPush: true,
  });

  assert.strictEqual(blockedWorkflowResult.success, false);
  assert.strictEqual(blockedWorkflowResult.testsPassed, false);
  assert.ok(blockedWorkflowResult.error?.toLowerCase().includes('tests failed'));
  assert.strictEqual(blockedWorkflowResult.commitSha, undefined);
  console.log('✅ PASS: Safety rule verified: Git push is blocked when automated test suite fails');

  // 5. Test Full AgentTeam Workflow with Jules & GitHub Pipeline
  (codingAgentManager as any).githubManager = testGitHubManager;

  const teamRunResult = await agentTeamEngine.runWorkflow(
    'Refactor error handling and push PR to GitHub',
    'tier_3',
    undefined,
    {
      provider: 'mock',
      codingAgent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      commitPushAndCreatePR: true,
    }
  );

  assert.strictEqual(teamRunResult.success, true);
  assert.ok(teamRunResult.steps.some((s) => s.phaseName === 'GitHub Workflow'));
  assert.strictEqual(teamRunResult.commitSha, '9f8e7d6c5b4a3210');
  assert.strictEqual(teamRunResult.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/555');
  assert.strictEqual(teamRunResult.finalReport?.metrics.commitSha, '9f8e7d6c5b4a3210');
  assert.strictEqual(teamRunResult.finalReport?.metrics.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/555');
  console.log('✅ PASS: Full AgentTeam workflow seamlessly executes GitHub delivery and captures metrics');

  // Restore env & original manager
  if (originalGithubToken) {
    process.env.GITHUB_TOKEN = originalGithubToken;
  } else {
    delete process.env.GITHUB_TOKEN;
  }
  (codingAgentManager as any).githubManager = new GitHubManager();
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('githubWorkflow.test')) {
  runGitHubWorkflowIntegrationTests().catch((err) => {
    console.error('GitHub integration tests failed:', err);
    process.exit(1);
  });
}
