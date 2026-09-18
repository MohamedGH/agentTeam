import { GitHubClient } from './githubClient';
import { GitHubRepository } from './githubRepository';
import { GitHubGitOperations, IGitExecutor, resolveSafeWorkspacePath } from './githubGitOperations';
import { GitHubPullRequest } from './githubPullRequest';
import { GitHubWorkflowResult, GitWorkflowOptions, GitHubRepoDetails } from './types';
import { evaluateQualityGate } from './qualityGate';
import fs from 'fs';
import path from 'path';

export class GitHubManager {
  private client: GitHubClient;
  private repositoryOps: GitHubRepository;
  private gitOps: GitHubGitOperations;
  private pullRequestOps: GitHubPullRequest;

  constructor(
    client?: GitHubClient,
    gitOps?: GitHubGitOperations,
    repositoryOps?: GitHubRepository,
    pullRequestOps?: GitHubPullRequest
  ) {
    this.client = client || new GitHubClient();
    this.gitOps = gitOps || new GitHubGitOperations();
    this.repositoryOps = repositoryOps || new GitHubRepository(this.client);
    this.pullRequestOps = pullRequestOps || new GitHubPullRequest(this.client);
  }

  public getClient(): GitHubClient {
    return this.client;
  }

  public getRepositoryOps(): GitHubRepository {
    return this.repositoryOps;
  }

  public getGitOps(): GitHubGitOperations {
    return this.gitOps;
  }

  public getPullRequestOps(): GitHubPullRequest {
    return this.pullRequestOps;
  }

  public isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /**
   * Set custom git executor for hermetic testing or isolated environments
   */
  public setGitExecutor(executor: IGitExecutor): void {
    this.gitOps.setExecutor(executor);
  }

  /**
   * Ensure a repository exists on GitHub, creating it if requested.
   * Never deletes or overwrites existing repositories.
   */
  public async ensureRepository(options: {
    repository: string;
    createRepository?: boolean;
    private?: boolean;
    description?: string;
    sessionStatus?: string | null;
    executionStatus?: string | null;
    realExecution?: boolean | null;
    testsPassed?: boolean | null;
    reviewExecuted?: boolean | null;
    reviewApproved?: boolean | null;
  }): Promise<GitHubRepoDetails> {
    if (options.createRepository) {
      const gateCheck = evaluateQualityGate({
        sessionStatus: options.sessionStatus,
        executionStatus: options.executionStatus,
        realExecution: options.realExecution,
        testsPassed: options.testsPassed,
        reviewExecuted: options.reviewExecuted,
        reviewApproved: options.reviewApproved,
      });

      if (!gateCheck.authorized) {
        throw new Error(gateCheck.reason || 'Quality Gate Refusal: Repository creation forbidden.');
      }
    }
    return await this.repositoryOps.ensureRepository(options);
  }

  /**
   * Execute the end-to-end GitHub result workflow:
   * 1. Check GITHUB_TOKEN
   * 2. Ensure repository exists or create it
   * 3. Run verification tests (blocks push if tests fail)
   * 4. Git status & modified files check
   * 5. Git commit with explicit message
   * 6. Git push to GitHub
   * 7. Create Pull Request if requested
   */
  public async processTaskResult(options: GitWorkflowOptions): Promise<GitHubWorkflowResult> {
    const shouldCommit = Boolean(
      options.git?.commit ||
      options.commitAndPush ||
      options.commitPushAndCreatePR
    );

    const shouldPush = Boolean(
      options.git?.push ||
      options.commitAndPush ||
      options.commitPushAndCreatePR
    );

    const shouldCreatePR = Boolean(
      options.git?.createPullRequest ||
      options.commitPushAndCreatePR
    );

    const targetBranch =
      options.branch ||
      `jules/task-${Date.now().toString(36)}`;
    const baseBranch = options.baseBranch || 'main';
    const isGitOperationRequested =
      shouldCommit ||
      shouldPush ||
      shouldCreatePR ||
      Boolean(options.createRepository);

    // 1. Parse repository path
    let owner = '';
    let repo = '';
    const parts = options.repository.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts.slice(1).join('/');
    } else {
      owner = 'user';
      repo = parts[0] || 'repo';
    }

    // 2. Strict session status & execution status checks
    if (options.sessionStatus && options.sessionStatus !== 'COMPLETED') {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Refusing Git operations: session status is ${options.sessionStatus}. Operations require COMPLETED.`,
      };
    }

    if (options.executionStatus && options.executionStatus !== 'COMPLETED') {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Refusing Git operations: execution status is ${options.executionStatus}. Operations require COMPLETED.`,
      };
    }

    // 3. Authentication check
    if ((shouldPush || shouldCreatePR || options.createRepository) && !this.isConfigured()) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: 'GITHUB_TOKEN is not configured',
      };
    }

    // 3. Early Quality Gate validation:
    // If downstream review or tests or session status failed, immediately refuse with Quality Gate Refusal.
    if (isGitOperationRequested) {
      const preliminaryGate = evaluateQualityGate({
        sessionStatus: options.sessionStatus,
        executionStatus: options.executionStatus,
        realExecution: true, // preliminary check for review/test/status gates
        testsPassed: options.testsPassed,
        reviewExecuted: options.reviewExecuted,
        reviewApproved: options.reviewApproved,
      });

      if (!preliminaryGate.authorized) {
        return {
          success: false,
          sessionId: options.sessionId,
          repository: `${owner}/${repo}`,
          branch: targetBranch,
          testsPassed: options.testsPassed === true,
          error: preliminaryGate.reason,
        };
      }
    }

    // 4. Strict workingDirectory requirement - NO process.cwd() fallback allowed
    if (!options.workingDirectory || typeof options.workingDirectory !== 'string' || options.workingDirectory.trim().length === 0) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: 'Git delivery refused: workingDirectory must be explicitly supplied for Git operations (no process.cwd fallback allowed).',
      };
    }
    const cwd = path.resolve(options.workingDirectory.trim());

    // 4. Working directory existence and directory check
    if (!fs.existsSync(cwd)) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Git delivery refused: working directory "${cwd}" is not a valid checkout for "${owner}/${repo}". Directory does not exist.`,
      };
    }
    if (!fs.statSync(cwd).isDirectory()) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Git delivery refused: working directory "${cwd}" is not a valid checkout for "${owner}/${repo}". Path is not a directory.`,
      };
    }

    // 5. Verify repository checkout and origin match BEFORE any file writes or mutations
    const verify = await this.gitOps.verifyGitRepository(cwd, options.repository);
    if (!verify.isValid) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Git delivery refused: working directory "${cwd}" is not a valid checkout for "${options.repository}". ${verify.error || ''}`.trim(),
      };
    }

    // 6. Internally derive realExecution (NEVER trust caller-provided boolean; options.realExecution has zero influence)
    const isMockOrSimulated = Boolean(
      options.sessionId?.startsWith('mock_') ||
      (options as any).agentId === 'mock' ||
      (options as any).isSimulation === true ||
      (options as any).isMockWorkspace === true ||
      (options as any).workspaceType === 'virtual'
    );
    const internallyDerivedRealExecution = Boolean(verify.isValid && !isMockOrSimulated);

    // 7. Full Quality Gate check with internally derived realExecution
    if (isGitOperationRequested) {
      const gateCheck = evaluateQualityGate({
        sessionStatus: options.sessionStatus,
        executionStatus: options.executionStatus,
        realExecution: internallyDerivedRealExecution,
        testsPassed: options.testsPassed,
        reviewExecuted: options.reviewExecuted,
        reviewApproved: options.reviewApproved,
      });

      if (!gateCheck.authorized) {
        return {
          success: false,
          sessionId: options.sessionId,
          repository: `${owner}/${repo}`,
          branch: targetBranch,
          testsPassed: options.testsPassed === true,
          error: gateCheck.reason,
        };
      }
    }

    try {
      // 9. Write virtual files to workspace ONLY AFTER verification and Quality Gate passed
      if (options.filesToCommit && Object.keys(options.filesToCommit).length > 0) {
        // Validate ALL paths prior to writing any single file to disk (atomic failure, blocks path traversal)
        const plannedWrites: { fullPath: string; content: string }[] = [];
        for (const [relPath, content] of Object.entries(options.filesToCommit)) {
          const fullPath = resolveSafeWorkspacePath(cwd, relPath);
          plannedWrites.push({
            fullPath,
            content: typeof content === 'string' ? content : String(content ?? ''),
          });
        }
        for (const { fullPath, content } of plannedWrites) {
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, 'utf-8');
        }
      }

      // 10. Check Git status & modified files
      const status = await this.gitOps.getStatus(cwd);
      if (status.error || status.success === false) {
        return {
          success: false,
          sessionId: options.sessionId,
          repository: `${owner}/${repo}`,
          branch: targetBranch,
          testsPassed: false,
          error: `Git status failed: ${status.error || 'Unknown git status error'}`,
        };
      }
      const allChangedFiles = [
        ...status.modifiedFiles,
        ...status.addedFiles,
        ...status.untrackedFiles,
      ];

      // 5. Run verification tests before any commit/push
      let testsPassed = true;
      if (options.testCommand) {
        const testResult = await this.gitOps.runVerificationTests(options.testCommand, cwd);
        testsPassed = testResult.passed;
        if (!testsPassed) {
          return {
            success: false,
            sessionId: options.sessionId,
            repository: `${owner}/${repo}`,
            branch: targetBranch,
            testsPassed: false,
            error: `Critical tests failed: aborting git push.\n${testResult.output}`,
          };
        }
      }

      if (!status.hasChanges && !shouldPush && !options.createRepository) {
        return {
          success: true,
          sessionId: options.sessionId,
          repository: `${owner}/${repo}`,
          branch: status.currentBranch || targetBranch,
          testsPassed,
          git: {
            committed: false,
            pushed: false,
            branch: status.currentBranch || targetBranch,
            filesChanged: [],
          },
        };
      }

      // 6. Ensure repository exists or create it on GitHub
      let repoDetails: GitHubRepoDetails | null = null;
      if (this.isConfigured() && (shouldPush || shouldCreatePR || options.createRepository)) {
        repoDetails = await this.repositoryOps.ensureRepository({
          repository: `${owner}/${repo}`,
          createRepository: options.createRepository,
          private: options.private,
          description: `Repository for ${options.taskPrompt.slice(0, 50)}`,
        });
      }

      // 7. Commit changes
      let commitSha: string | undefined;
      let commitUrl: string | undefined;
      let committed = false;

      if (shouldCommit) {
        const commitMessage =
          options.commitMessage ||
          `feat(jules): ${options.taskPrompt.slice(0, 72)}`;

        const commitRes = await this.gitOps.commitChanges({
          message: commitMessage,
          branch: targetBranch,
          cwd,
        });

        committed = commitRes.committed;
        commitSha = commitRes.commitSha;
        commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;
      }

      // 7. Push branch to GitHub
      let pushed = false;
      if (shouldPush) {
        if (!this.isConfigured()) {
          throw new Error('GITHUB_TOKEN is not configured');
        }

        const pushRes = await this.gitOps.pushBranch({
          branch: targetBranch,
          owner,
          repo,
          token: this.client.getToken(),
          cwd,
        });

        pushed = pushRes.pushed;
        commitSha = pushRes.commitSha;
        commitUrl = pushRes.commitUrl;
      }

      // 8. Create Pull Request if requested
      let pullRequestUrl: string | undefined;
      if (shouldCreatePR && this.isConfigured()) {
        const prBody = this.pullRequestOps.formatPullRequestBody(options.taskPrompt, {
          branch: targetBranch,
          commitSha,
          testsPassed,
          filesChanged: allChangedFiles,
          summary: `Autonomous delivery created by agentTeam for: "${options.taskPrompt}"`,
        });

        const pr = await this.pullRequestOps.createPullRequest(owner, repo, {
          title: `[Jules] ${options.taskPrompt.slice(0, 70)}`,
          head: targetBranch,
          base: baseBranch,
          body: prBody,
        });

        pullRequestUrl = pr.html_url;
      }

      return {
        success: true,
        sessionId: options.sessionId,
        repository: `${owner}/${repo}`,
        branch: targetBranch,
        commitSha,
        commitUrl,
        pullRequestUrl,
        testsPassed,
        git: {
          committed,
          pushed,
          branch: targetBranch,
          commitSha,
          commitUrl,
          pullRequestUrl,
          filesChanged: allChangedFiles,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: options.repository,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: err.message,
      };
    }
  }
}

export const githubManager = new GitHubManager();
