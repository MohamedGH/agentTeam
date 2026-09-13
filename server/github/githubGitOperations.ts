import { exec } from 'child_process';
import { promisify } from 'util';
import { GitCommitResult, GitPushResult, GitStatusResult } from './types';

const execAsync = promisify(exec);

export interface IGitExecutor {
  exec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }>;
}

export class RealGitExecutor implements IGitExecutor {
  public async exec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return await execAsync(command, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  }
}

export class GitHubGitOperations {
  private executor: IGitExecutor;

  constructor(executor?: IGitExecutor) {
    this.executor = executor || new RealGitExecutor();
  }

  public setExecutor(executor: IGitExecutor): void {
    this.executor = executor;
  }

  /**
   * Check Git status of workspace
   */
  public async getStatus(cwd?: string): Promise<GitStatusResult> {
    try {
      const { stdout } = await this.executor.exec('git status --porcelain', cwd);
      const lines = stdout.split('\n').map((l) => l.trimEnd()).filter(Boolean);

      const modifiedFiles: string[] = [];
      const addedFiles: string[] = [];
      const deletedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      for (const line of lines) {
        const code = line.slice(0, 2);
        const file = line.slice(3).trim();

        if (code.includes('M')) {
          modifiedFiles.push(file);
        } else if (code.includes('A')) {
          addedFiles.push(file);
        } else if (code.includes('D')) {
          deletedFiles.push(file);
        } else if (code.includes('?')) {
          untrackedFiles.push(file);
        }
      }

      let currentBranch: string | undefined;
      try {
        const branchRes = await this.executor.exec('git branch --show-current', cwd);
        currentBranch = branchRes.stdout.trim() || undefined;
      } catch {
        // May be detached HEAD or empty repo
      }

      const hasChanges = lines.length > 0;
      return {
        hasChanges,
        modifiedFiles,
        addedFiles,
        deletedFiles,
        untrackedFiles,
        currentBranch,
        rawStatus: stdout,
      };
    } catch (err: any) {
      // If directory is not a git repo or git fails
      return {
        hasChanges: false,
        modifiedFiles: [],
        addedFiles: [],
        deletedFiles: [],
        untrackedFiles: [],
        rawStatus: err.message,
      };
    }
  }

  /**
   * Run verification tests before pushing.
   * Ensures critical tests pass.
   */
  public async runVerificationTests(
    testCommand: string = 'npm run lint',
    cwd?: string
  ): Promise<{ passed: boolean; output: string }> {
    try {
      const { stdout, stderr } = await this.executor.exec(testCommand, cwd);
      const fullOutput = `${stdout}\n${stderr}`.trim();
      const isFailed =
        fullOutput.includes('FAIL') ||
        fullOutput.includes('ERR!') ||
        fullOutput.includes('error TS');

      return {
        passed: !isFailed,
        output: fullOutput,
      };
    } catch (err: any) {
      return {
        passed: false,
        output: err.stdout ? `${err.stdout}\n${err.stderr}` : err.message,
      };
    }
  }

  /**
   * Commit changed files to git
   */
  public async commitChanges(options: {
    message: string;
    branch?: string;
    files?: string[];
    cwd?: string;
  }): Promise<GitCommitResult> {
    const cwd = options.cwd;
    const status = await this.getStatus(cwd);

    if (!status.hasChanges) {
      // Retrieve current commit SHA even if no changes
      let currentSha = 'HEAD';
      try {
        const shaRes = await this.executor.exec('git rev-parse HEAD', cwd);
        currentSha = shaRes.stdout.trim();
      } catch {
        currentSha = '0000000000000000000000000000000000000000';
      }

      return {
        committed: false,
        commitSha: currentSha,
        commitMessage: 'No changes to commit',
        filesCommitted: [],
      };
    }

    // Switch or create dedicated branch if requested
    if (options.branch && options.branch !== status.currentBranch) {
      try {
        // Try checkout if branch already exists
        await this.executor.exec(`git checkout ${options.branch}`, cwd);
      } catch {
        // Otherwise create new branch
        await this.executor.exec(`git checkout -b ${options.branch}`, cwd);
      }
    }

    // Stage files
    if (options.files && options.files.length > 0) {
      for (const file of options.files) {
        await this.executor.exec(`git add "${file}"`, cwd);
      }
    } else {
      await this.executor.exec('git add -A', cwd);
    }

    // Commit with explicit message
    const safeMessage = options.message.replace(/"/g, '\\"');
    await this.executor.exec(`git commit -m "${safeMessage}"`, cwd);

    const shaRes = await this.executor.exec('git rev-parse HEAD', cwd);
    const commitSha = shaRes.stdout.trim();

    const filesCommitted = [
      ...status.modifiedFiles,
      ...status.addedFiles,
      ...status.untrackedFiles,
    ];

    return {
      committed: true,
      commitSha,
      commitMessage: options.message,
      filesCommitted,
    };
  }

  /**
   * Push branch to GitHub remote
   */
  public async pushBranch(options: {
    branch: string;
    owner: string;
    repo: string;
    token: string;
    remote?: string;
    cwd?: string;
  }): Promise<GitPushResult> {
    const cwd = options.cwd;
    const remote = options.remote || 'origin';

    // Retrieve commit SHA
    let commitSha = '';
    try {
      const shaRes = await this.executor.exec('git rev-parse HEAD', cwd);
      commitSha = shaRes.stdout.trim();
    } catch {
      commitSha = 'HEAD';
    }

    // Prepare authenticated push remote URL (or standard push if remote already authenticated)
    const remoteUrl = `https://x-access-token:${options.token}@github.com/${options.owner}/${options.repo}.git`;

    try {
      // Push explicitly to remote URL with branch
      await this.executor.exec(`git push ${remoteUrl} ${options.branch}:${options.branch}`, cwd);
    } catch (err: any) {
      // Mask token if present in error message to prevent credential leak
      const safeErrorMsg = (err.message || '').replace(options.token, '***GITHUB_TOKEN***');
      throw new Error(`Git push failed to ${options.owner}/${options.repo} on branch ${options.branch}: ${safeErrorMsg}`);
    }

    const commitUrl = `https://github.com/${options.owner}/${options.repo}/commit/${commitSha}`;

    return {
      pushed: true,
      branch: options.branch,
      remote,
      commitSha,
      commitUrl,
    };
  }
}
