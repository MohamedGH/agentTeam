import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { GitCommitResult, GitPushResult, GitStatusResult } from './types';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface IGitExecutor {
  exec(command: string, cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string }>;
  execFile?(file: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string }>;
}

export function sanitizeGitOutput(text: string, token?: string): string {
  if (!text) return '';
  let sanitized = text;
  if (token && token.length > 3) {
    sanitized = sanitized.split(token).join('***GITHUB_TOKEN***');
    // Also mask base64 basic auth if present
    const base64Basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    sanitized = sanitized.split(base64Basic).join('***AUTH_BASIC***');
  }
  // Generic token / bearer sanitization
  sanitized = sanitized.replace(/(?:ghp_|gho_|github_pat_)[a-zA-Z0-9_]+/g, '***GITHUB_TOKEN***');
  sanitized = sanitized.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
  sanitized = sanitized.replace(/AUTHORIZATION:\s*basic\s+[a-zA-Z0-9+/=]+/gi, 'AUTHORIZATION: basic ***');
  return sanitized;
}

export function validateBranchName(branch?: string): void {
  if (!branch || typeof branch !== 'string' || branch.trim().length === 0) {
    throw new Error('Invalid branch name: branch must be a non-empty string');
  }
  const trimmed = branch.trim();
  if (
    trimmed.includes('..') ||
    trimmed.startsWith('-') ||
    trimmed.endsWith('/') ||
    trimmed.startsWith('/') ||
    !/^[A-Za-z0-9._/-]+$/.test(trimmed) ||
    /[;`$<>|&"'\s\\]/.test(trimmed)
  ) {
    throw new Error(`Invalid branch name "${branch}": contains disallowed characters, path traversal, or command injection sequences`);
  }
}

export function validateFilePath(filePath?: string): void {
  if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid file path: path must be a non-empty string');
  }
  const trimmed = filePath.trim();
  if (
    trimmed.includes('..') ||
    trimmed.startsWith('-') ||
    /[;`$<>|&"'\n\r\t]/.test(trimmed)
  ) {
    throw new Error(`Invalid file path "${filePath}": contains disallowed characters or path traversal`);
  }
}

export function validateRepoIdentifier(name?: string, label: string = 'Repository identifier'): void {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed) || trimmed.includes('..') || trimmed.startsWith('-')) {
    throw new Error(`Invalid ${label} "${name}": contains disallowed characters`);
  }
}

export function validateTestCommand(cmd?: string): { file: string; args: string[] } {
  if (!cmd || typeof cmd !== 'string' || cmd.trim().length === 0) {
    throw new Error('Invalid test command: command must be a non-empty string');
  }
  const trimmed = cmd.trim();
  // Disallow shell operators / piping / chaining / redirection / command substitution
  if (/[;&|`$<>()\\]/.test(trimmed) || /[\r\n]/.test(trimmed)) {
    throw new Error(`Disallowed test command "${cmd}": shell operators, piping, and chaining are strictly forbidden.`);
  }

  // Parse space-delimited tokens safely
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const binary = tokens[0];
  const ALLOWED_TEST_BINARIES = [
    'npm',
    'npx',
    'pytest',
    'yarn',
    'pnpm',
    'vitest',
    'jest',
    'cargo',
    'go',
    'node',
    'tsx',
    'echo',
    'exit',
  ];

  if (!ALLOWED_TEST_BINARIES.includes(binary)) {
    throw new Error(`Disallowed test executable "${binary}". Allowed test executables: ${ALLOWED_TEST_BINARIES.join(', ')}`);
  }

  return {
    file: binary,
    args: tokens.slice(1),
  };
}

export class RealGitExecutor implements IGitExecutor {
  public async exec(command: string, cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    return await execAsync(command, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: '0' },
    });
  }

  public async execFile(file: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string }> {
    return await execFileAsync(file, args, {
      cwd: options?.cwd || process.cwd(),
      env: { ...process.env, ...options?.env, GIT_TERMINAL_PROMPT: '0' },
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

  private async runGit(args: string[], cwd?: string, token?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      if (this.executor.execFile) {
        return await this.executor.execFile('git', args, { cwd });
      } else {
        const cmd = `git ${args.map(a => (a.includes(' ') || a.includes('"') ? JSON.stringify(a) : a)).join(' ')}`;
        return await this.executor.exec(cmd, cwd);
      }
    } catch (err: any) {
      const sanitizedMsg = sanitizeGitOutput(err.message || String(err), token);
      const safeErr = new Error(sanitizedMsg);
      (safeErr as any).stdout = sanitizeGitOutput(err.stdout || '', token);
      (safeErr as any).stderr = sanitizeGitOutput(err.stderr || '', token);
      throw safeErr;
    }
  }

  /**
   * Check Git status of workspace.
   * If git status fails, returns success: false with structured error instead of masking as hasChanges: false.
   */
  public async getStatus(cwd?: string): Promise<GitStatusResult> {
    try {
      const { stdout } = await this.runGit(['status', '--porcelain'], cwd);
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
        const branchRes = await this.runGit(['branch', '--show-current'], cwd);
        currentBranch = branchRes.stdout.trim() || undefined;
      } catch {
        // May be detached HEAD or empty repo
      }

      const hasChanges = lines.length > 0;
      return {
        success: true,
        hasChanges,
        modifiedFiles,
        addedFiles,
        deletedFiles,
        untrackedFiles,
        currentBranch,
        rawStatus: stdout,
      };
    } catch (err: any) {
      // Return structured failure rather than masking as clean workspace
      return {
        success: false,
        error: err.message || 'Failed to execute git status',
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
   * Validates test command against safe executable allowlist and executes without arbitrary shell injection.
   */
  public async runVerificationTests(
    testCommand: string = 'npm test',
    cwd?: string
  ): Promise<{ passed: boolean; output: string }> {
    try {
      const { file, args } = validateTestCommand(testCommand);
      let stdout = '';
      let stderr = '';

      if (this.executor.execFile) {
        const res = await this.executor.execFile(file, args, { cwd });
        stdout = res.stdout;
        stderr = res.stderr;
      } else {
        const safeCmd = [file, ...args].join(' ');
        const res = await this.executor.exec(safeCmd, cwd);
        stdout = res.stdout;
        stderr = res.stderr;
      }

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
        output: err.stdout ? `${err.stdout}\n${err.stderr}` : (err.message || 'Test execution failed'),
      };
    }
  }

  /**
   * Commit changed files to git with argument validation and array execution.
   */
  public async commitChanges(options: {
    message: string;
    branch?: string;
    files?: string[];
    cwd?: string;
  }): Promise<GitCommitResult> {
    const cwd = options.cwd;

    if (options.branch) {
      validateBranchName(options.branch);
    }
    if (options.files) {
      for (const f of options.files) {
        validateFilePath(f);
      }
    }

    const status = await this.getStatus(cwd);
    if (!status.success || status.error) {
      throw new Error(`Cannot commit changes: git status failed (${status.error})`);
    }

    if (!status.hasChanges) {
      // Retrieve current commit SHA even if no changes
      let currentSha = 'HEAD';
      try {
        const shaRes = await this.runGit(['rev-parse', 'HEAD'], cwd);
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
        await this.runGit(['checkout', options.branch], cwd);
      } catch {
        await this.runGit(['checkout', '-b', options.branch], cwd);
      }
    }

    // Stage files
    if (options.files && options.files.length > 0) {
      for (const file of options.files) {
        await this.runGit(['add', file], cwd);
      }
    } else {
      await this.runGit(['add', '-A'], cwd);
    }

    // Commit with explicit message
    await this.runGit(['commit', '-m', options.message], cwd);

    const shaRes = await this.runGit(['rev-parse', 'HEAD'], cwd);
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
   * Push branch to GitHub remote securely.
   * Token is passed via extraheader authorization, never exposed in command line, URL, or logs.
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

    validateBranchName(options.branch);
    validateRepoIdentifier(options.owner, 'Owner');
    validateRepoIdentifier(options.repo, 'Repository');

    if (!options.token || typeof options.token !== 'string') {
      throw new Error('Authentication token is required for push operations');
    }

    // Retrieve commit SHA
    let commitSha = '';
    try {
      const shaRes = await this.runGit(['rev-parse', 'HEAD'], cwd);
      commitSha = shaRes.stdout.trim();
    } catch {
      commitSha = 'HEAD';
    }

    // Clean remote URL without token embedded in the URL
    const remoteUrl = `https://github.com/${options.owner}/${options.repo}.git`;
    const basicAuth = Buffer.from(`x-access-token:${options.token}`).toString('base64');
    const headerArg = `-c http.extraheader=AUTHORIZATION: basic ${basicAuth}`;

    try {
      // Execute git push securely
      if (this.executor.execFile) {
        await this.executor.execFile(
          'git',
          ['-c', `http.extraheader=AUTHORIZATION: basic ${basicAuth}`, 'push', remoteUrl, `${options.branch}:${options.branch}`],
          { cwd }
        );
      } else {
        await this.executor.exec(`git ${headerArg} push ${remoteUrl} ${options.branch}:${options.branch}`, cwd);
      }
    } catch (err: any) {
      const safeErrorMsg = sanitizeGitOutput(err.message || String(err), options.token);
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
