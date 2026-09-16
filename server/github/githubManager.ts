import { GitHubClient } from './githubClient';
import { GitHubRepository } from './githubRepository';
import { GitHubGitOperations, IGitExecutor } from './githubGitOperations';
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
    testsPassed?: boolean | null;
    reviewExecuted?: boolean | null;
    reviewApproved?: boolean | null;
  }): Promise<GitHubRepoDetails> {
    if (options.createRepository) {
      const gateCheck = evaluateQualityGate({
        sessionStatus: options.sessionStatus,
        executionStatus: options.executionStatus,
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
    const cwd = options.workingDirectory || process.cwd();
    const isGitOperationRequested =
      shouldCommit ||
      shouldPush ||
      shouldCreatePR ||
      Boolean(options.createRepository);

    // 0. Strict session status & quality gates check:
    // Any call to processTaskResult with non-COMPLETED session or execution status is refused immediately.
    if (options.sessionStatus && options.sessionStatus !== 'COMPLETED') {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: options.repository,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Refusing Git operations: session status is ${options.sessionStatus}. Operations require COMPLETED.`,
      };
    }

    if (options.executionStatus && options.executionStatus !== 'COMPLETED') {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: options.repository,
        branch: targetBranch,
        testsPassed: options.testsPassed === true,
        error: `Refusing Git operations: execution status is ${options.executionStatus}. Operations require COMPLETED.`,
      };
    }

    // Git operations (Commit / Push / PR / createRepository) are strictly authorized ONLY IF:
    // sessionStatus === 'COMPLETED'
    // executionStatus === 'COMPLETED'
    // testsPassed === true
    // reviewExecuted === true
    // reviewApproved === true
    // undefined or false => refusal. Only exact combination authorizes Git.
    if (isGitOperationRequested) {
      const gateCheck = evaluateQualityGate({
        sessionStatus: options.sessionStatus,
        executionStatus: options.executionStatus,
        testsPassed: options.testsPassed,
        reviewExecuted: options.reviewExecuted,
        reviewApproved: options.reviewApproved,
      });

      if (!gateCheck.authorized) {
        return {
          success: false,
          sessionId: options.sessionId,
          repository: options.repository,
          branch: targetBranch,
          testsPassed: options.testsPassed === true,
          error: gateCheck.reason,
        };
      }
    }

    // 1. Authentication check
    if ((shouldPush || shouldCreatePR || options.createRepository) && !this.isConfigured()) {
      return {
        success: false,
        sessionId: options.sessionId,
        repository: options.repository,
        branch: targetBranch,
        testsPassed: true,
        error: 'GITHUB_TOKEN is not configured',
      };
    }

    try {
      // 2. Parse repository path
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

      // 3. Write virtual files to workspace if provided
      if (options.filesToCommit && Object.keys(options.filesToCommit).length > 0) {
        for (const [relPath, content] of Object.entries(options.filesToCommit)) {
          const fullPath = path.resolve(cwd, relPath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, 'utf-8');
        }
      }

      // 4. Check Git status & modified files
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
        testsPassed: true,
        error: err.message,
      };
    }
  }
}

export const githubManager = new GitHubManager();
