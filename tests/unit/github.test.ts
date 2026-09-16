import assert from 'assert';
import { GitHubClient } from '../../server/github/githubClient';
import { GitHubRepository } from '../../server/github/githubRepository';
import { GitHubPullRequest } from '../../server/github/githubPullRequest';
import { GitHubGitOperations } from '../../server/github/githubGitOperations';
import { GitHubManager } from '../../server/github/githubManager';
import { evaluateQualityGate, isQualityGateAuthorized } from '../../server/github/qualityGate';

export async function runGitHubUnitTests() {
  console.log('\n--- [Unit Test] GitHub Automation & Git Workflow Services ---');

  // 0. Quality Gate unit tests: strict 4-condition enforcement
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: true,
      reviewApproved: true,
    }),
    true
  );

  // Undefined or null checks
  assert.strictEqual(isQualityGateAuthorized(undefined), false);
  assert.strictEqual(isQualityGateAuthorized(null), false);
  assert.strictEqual(isQualityGateAuthorized({}), false);

  // Individual violations must fail
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'RUNNING',
      executionStatus: 'COMPLETED',
      testsPassed: true,
      reviewApproved: true,
    }),
    false
  );
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'FAILED',
      testsPassed: true,
      reviewApproved: true,
    }),
    false
  );
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: false,
      reviewApproved: true,
    }),
    false
  );
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: true,
      reviewApproved: false,
    }),
    false
  );
  // Undefined flags must NOT default to true
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: undefined,
      reviewApproved: true,
    }),
    false
  );
  assert.strictEqual(
    isQualityGateAuthorized({
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: true,
      reviewApproved: undefined,
    }),
    false
  );
  console.log('✅ PASS: evaluateQualityGate strictly enforces 4-condition invariant (sessionStatus, executionStatus, testsPassed, reviewApproved)');

  // 1. GitHubClient configuration & token validation
  const clientWithoutToken = new GitHubClient({ token: '' });
  assert.strictEqual(clientWithoutToken.isConfigured(), false);
  console.log('✅ PASS: GitHubClient accurately reports isConfigured() = false when token is absent');

  const clientWithToken = new GitHubClient({ token: 'ghp_test_token_12345', baseUrl: 'https://api.github.com' });
  assert.strictEqual(clientWithToken.isConfigured(), true);
  console.log('✅ PASS: GitHubClient accurately reports isConfigured() = true when token is provided');

  // 2. Mock REST fetch responses to verify API client parsing
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/user')) {
        return new Response(
          JSON.stringify({
            id: 123456,
            login: 'MohamedGH',
            avatar_url: 'https://avatars.githubusercontent.com/u/123456',
            html_url: 'https://github.com/MohamedGH',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/repos/MohamedGH/agentTeam')) {
        return new Response(
          JSON.stringify({
            id: 987654,
            name: 'agentTeam',
            full_name: 'MohamedGH/agentTeam',
            private: false,
            default_branch: 'main',
            html_url: 'https://github.com/MohamedGH/agentTeam',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/repos/MohamedGH/agentTeam/pulls')) {
        return new Response(
          JSON.stringify({
            id: 42,
            number: 42,
            title: 'agentTeam: fix bug',
            html_url: 'https://github.com/MohamedGH/agentTeam/pull/42',
            state: 'open',
            head: { ref: 'jules/patch-1' },
            base: { ref: 'main' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    };

    const user = await clientWithToken.getAuthenticatedUser();
    assert.strictEqual(user.login, 'MohamedGH');
    assert.strictEqual(user.id, 123456);
    console.log('✅ PASS: GitHubClient.getAuthenticatedUser parses authenticated user payload');

    const repo = await clientWithToken.request<any>('/repos/MohamedGH/agentTeam');
    assert.ok(repo);
    assert.strictEqual(repo.full_name, 'MohamedGH/agentTeam');
    assert.strictEqual(repo.default_branch, 'main');
    console.log('✅ PASS: GitHubClient.request retrieves existing repo metadata');

    const repoOps = new GitHubRepository(clientWithToken);
    const repoInfo = await repoOps.getRepository('MohamedGH', 'agentTeam');
    assert.strictEqual(repoInfo?.full_name, 'MohamedGH/agentTeam');
    console.log('✅ PASS: GitHubRepository.getRepository retrieves existing repo metadata');

    const prOps = new GitHubPullRequest(clientWithToken);
    const pr = await prOps.createPullRequest('MohamedGH', 'agentTeam', {
      title: 'agentTeam: fix bug',
      body: 'Automated patch from Jules',
      head: 'jules/patch-1',
      base: 'main',
    });
    assert.strictEqual(pr.number, 42);
    assert.strictEqual(pr.html_url, 'https://github.com/MohamedGH/agentTeam/pull/42');
    console.log('✅ PASS: GitHubPullRequest.createPullRequest creates and returns PR record');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 3. GitHubClient - parseRepoPath logic
  const parsed1 = await clientWithToken.parseRepoPath('MohamedGH/agentTeam');
  assert.deepStrictEqual(parsed1, { owner: 'MohamedGH', repo: 'agentTeam' });

  const parsed2 = await clientWithToken.parseRepoPath('https://github.com/MohamedGH/agentTeam');
  assert.deepStrictEqual(parsed2, { owner: 'MohamedGH', repo: 'agentTeam' });
  console.log('✅ PASS: GitHubClient.parseRepoPath accurately parses repository slug and URLs');

  // 4. GitHubPullRequest - markdown body generation
  const prService = new GitHubPullRequest(clientWithToken);
  const formattedBody = prService.formatPullRequestBody('Refactor math utilities and add tests', {
    branch: 'jules/math-refactor',
    commitSha: 'a1b2c3d4e5f6',
    filesChanged: ['src/math.ts', 'tests/math.test.ts'],
    testsPassed: true,
  });
  assert.ok(formattedBody.includes('Refactor math utilities and add tests'));
  assert.ok(formattedBody.includes('src/math.ts'));
  assert.ok(formattedBody.includes('a1b2c3d'));
  assert.ok(formattedBody.includes('PASSED'));
  console.log('✅ PASS: GitHubPullRequest.formatPullRequestBody generates structured PR descriptions');

  // 5. GitHubGitOperations - test execution & safety guards
  const gitOps = new GitHubGitOperations();
  const testPassResult = await gitOps.runVerificationTests('echo "test passed"');
  assert.strictEqual(testPassResult.passed, true);
  console.log('✅ PASS: GitHubGitOperations.runVerificationTests correctly evaluates successful commands');

  const testFailResult = await gitOps.runVerificationTests('exit 1');
  assert.strictEqual(testFailResult.passed, false);
  console.log('✅ PASS: GitHubGitOperations.runVerificationTests correctly catches failing test suites');

  // 6. GitHubManager - End-to-End Orchestrator with mock Git & Client
  const unconfiguredManager = new GitHubManager(new GitHubClient({ token: '' }));
  assert.strictEqual(unconfiguredManager.isConfigured(), false);

  const unconfiguredResult = await unconfiguredManager.processTaskResult({
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    taskPrompt: 'Add features',
    sessionStatus: 'COMPLETED',
    executionStatus: 'COMPLETED',
    testsPassed: true,
    reviewApproved: true,
    commitAndPush: true,
  });
  assert.strictEqual(unconfiguredResult.success, false);
  assert.strictEqual(unconfiguredResult.error, 'GITHUB_TOKEN is not configured');
  console.log('✅ PASS: GitHubManager refuses execution and returns clean error if GITHUB_TOKEN is absent');

  // Test critical safety gate: block push if tests fail
  const mockFailingGitOps = new GitHubGitOperations();
  mockFailingGitOps.runVerificationTests = async () => ({
    passed: false,
    output: 'CRITICAL FAILURE: 2 test suites failed',
  });

  const failingManager = new GitHubManager(
    clientWithToken,
    mockFailingGitOps
  );

  // Test Quality Gate rejection when missing status
  const missingStatusResult = await failingManager.processTaskResult({
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    taskPrompt: 'Refactor core logic',
    testCommand: 'npm test',
    commitAndPush: true,
  });
  assert.strictEqual(missingStatusResult.success, false);
  assert.ok(missingStatusResult.error?.includes('Quality Gate Refusal'));
  console.log('✅ PASS: Quality Gate blocks Git mutations when parameters are undefined');

  // Test Quality Gate rejection when tests fail
  const blockedResult = await failingManager.processTaskResult({
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    taskPrompt: 'Refactor core logic',
    sessionStatus: 'COMPLETED',
    executionStatus: 'COMPLETED',
    testsPassed: false,
    reviewApproved: true,
    testCommand: 'npm test',
    commitAndPush: true,
  });

  assert.strictEqual(blockedResult.success, false);
  assert.strictEqual(blockedResult.testsPassed, false);
  assert.ok(blockedResult.error?.includes('Quality Gate Refusal') || blockedResult.error?.includes('Critical tests failed'));
  assert.strictEqual(blockedResult.git?.pushed, undefined);
  console.log('✅ PASS: Critical safety rule enforced: Automated git push is BLOCKED when tests fail');

  // Test successful commit, push, and PR creation workflow when Quality Gate is fully satisfied
  const mockSuccessfulGitOps = new GitHubGitOperations();
  mockSuccessfulGitOps.runVerificationTests = async () => ({
    passed: true,
    output: 'All tests passed (100%)',
  });
  mockSuccessfulGitOps.getStatus = async () => ({
    hasChanges: true,
    modifiedFiles: ['src/index.ts', 'tests/index.test.ts'],
    addedFiles: [],
    deletedFiles: [],
    untrackedFiles: [],
    currentBranch: 'main',
  });
  mockSuccessfulGitOps.commitChanges = async () => ({
    committed: true,
    commitSha: 'c0ffee1234567890abcdef',
    commitMessage: 'agentTeam: Refactor core logic',
    filesCommitted: ['src/index.ts', 'tests/index.test.ts'],
  });
  mockSuccessfulGitOps.pushBranch = async (opts) => ({
    pushed: true,
    branch: opts.branch,
    commitSha: 'c0ffee1234567890abcdef',
    commitUrl: `https://github.com/${opts.owner}/${opts.repo}/commit/c0ffee1234567890abcdef`,
  });

  const mockClient = new GitHubClient({ token: 'mock-token' });
  const mockPRService = new GitHubPullRequest(mockClient);
  mockPRService.createPullRequest = async (owner, repo, opts) => ({
    id: 101,
    number: 101,
    title: opts.title,
    html_url: `https://github.com/${owner}/${repo}/pull/101`,
    state: 'open',
    head: { ref: opts.head },
    base: { ref: opts.base },
  });

  const mockRepoService = new GitHubRepository(mockClient);
  mockRepoService.ensureRepository = async () => ({
    name: 'agentTeam',
    full_name: 'MohamedGH/agentTeam',
    private: false,
    default_branch: 'main',
    html_url: 'https://github.com/MohamedGH/agentTeam',
  });

  const successfulManager = new GitHubManager(
    mockClient,
    mockSuccessfulGitOps,
    mockRepoService,
    mockPRService
  );

  const completeResult = await successfulManager.processTaskResult({
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    taskPrompt: 'Refactor core logic',
    sessionStatus: 'COMPLETED',
    executionStatus: 'COMPLETED',
    testsPassed: true,
    reviewApproved: true,
    commitPushAndCreatePR: true,
  });

  assert.strictEqual(completeResult.success, true);
  assert.strictEqual(completeResult.testsPassed, true);
  assert.strictEqual(completeResult.commitSha, 'c0ffee1234567890abcdef');
  assert.strictEqual(completeResult.pullRequestUrl, 'https://github.com/MohamedGH/agentTeam/pull/101');
  assert.strictEqual(completeResult.git?.committed, true);
  assert.strictEqual(completeResult.git?.pushed, true);
  assert.deepStrictEqual(completeResult.git?.filesChanged, ['src/index.ts', 'tests/index.test.ts']);
  console.log('✅ PASS: Complete GitHub workflow succeeded: commit, push, PR URL returned accurately');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('github.test')) {
  runGitHubUnitTests().catch((err) => {
    console.error('GitHub unit tests failed:', err);
    process.exit(1);
  });
}
