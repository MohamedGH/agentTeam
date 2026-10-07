import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { GitCommitResult, GitPushResult, GitStatusResult } from './types';

const execFileAsync = promisify(execFile);

export interface IGitExecutor {
  exec(command: string, cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  execFile?(file: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
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
    trimmed.includes('\0') ||
    /%(?:2e|2f|5c|00)/i.test(trimmed) ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    /^[a-zA-Z]:/.test(trimmed) ||
    /[;`$<>|&"'\n\r\t]/.test(trimmed)
  ) {
    throw new Error(`Invalid file path "${filePath}": contains disallowed characters or path traversal`);
  }
  let decoded = trimmed;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error(`Invalid file path "${filePath}": malformed percent-encoding`);
    }
  }
  if (decoded.includes('..') || decoded.includes('\0') || /%(?:2e|2f|5c|00)/i.test(decoded)) {
    throw new Error(`Invalid file path "${filePath}": path traversal detected in decoded path`);
  }
}

/**
 * Validates and resolves a relative workspace file path safely.
 * Strictly prevents directory traversal (../../x, ..\..\x, %2e%2e%2f, /etc/x, C:\x, \\server\share\x, .env, .git, node_modules).
 * Enforces that resolved path resides strictly within the specified working directory.
 */
export function resolveSafeWorkspacePath(cwd: string, relPath: string): string {
  if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('Invalid workspace directory: cwd must be a non-empty string');
  }
  if (!relPath || typeof relPath !== 'string' || relPath.trim().length === 0) {
    throw new Error('Invalid file path: path must be a non-empty string');
  }

  // Reject null bytes and URL-encoded traversal/null-byte sequences
  if (relPath.includes('\0') || /%(?:2e|2f|5c|00)/i.test(relPath)) {
    throw new Error(`Invalid file path "${relPath}": contains null bytes or encoded path traversal sequences`);
  }

  // Decode up to 3 times to catch multi-encoded traversal attempts
  let decoded = relPath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error(`Invalid file path "${relPath}": malformed percent-encoding`);
    }
  }

  if (decoded.includes('\0') || decoded.includes('..') || /%(?:2e|2f|5c|00)/i.test(decoded)) {
    throw new Error(`Path traversal detected and blocked in "${relPath}"`);
  }

  // Windows-style drive letters (C:\, C:/, C:, etc.) or UNC network shares (\\server\share, //server/share)
  if (/^[a-zA-Z]:/.test(relPath) || /^[a-zA-Z]:/.test(decoded) || /^(\\\\|\/\/)/.test(relPath) || /^(\\\\|\/\/)/.test(decoded)) {
    throw new Error(`Invalid file path "${relPath}": absolute drive or UNC network paths are strictly forbidden`);
  }

  // Disallow paths starting with absolute root '/' or '\'
  if (relPath.startsWith('/') || relPath.startsWith('\\') || decoded.startsWith('/') || decoded.startsWith('\\')) {
    throw new Error(`Invalid file path "${relPath}": absolute root paths are strictly forbidden`);
  }

  const normalizedRel = decoded.replace(/\\/g, '/');
  const segments = normalizedRel.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid file path "${relPath}"`);
  }

  const PROTECTED_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__']);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`Path traversal detected and blocked: "${relPath}"`);
    }
    if (PROTECTED_DIRS.has(seg)) {
      throw new Error(`Access to protected directory "${seg}" is forbidden: "${relPath}"`);
    }
  }

  const baseName = segments[segments.length - 1];
  if ((baseName === '.env' || baseName.startsWith('.env.')) && baseName !== '.env.example') {
    throw new Error(`Access to sensitive environment file "${baseName}" is forbidden: "${relPath}"`);
  }

  const resolvedCwd = path.resolve(cwd);
  const resolvedTarget = path.resolve(resolvedCwd, normalizedRel);

  // Check containment via path.relative
  const relative = path.relative(resolvedCwd, resolvedTarget);

  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.includes(`..${path.sep}`) ||
    relative.includes('../')
  ) {
    throw new Error(`Path traversal attempt blocked: "${relPath}" resolves outside workspace "${cwd}"`);
  }

  return resolvedTarget;
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

/**
 * Normalize repository identifier from various URL and string formats:
 * - https://github.com/MohamedGH/agentTeam.git
 * - https://github.com/MohamedGH/agentTeam
 * - git@github.com:MohamedGH/agentTeam.git
 * - ssh://git@github.com/MohamedGH/agentTeam.git
 * - MohamedGH/agentTeam
 * Returns standard "owner/repo" format.
 */
export function normalizeRepoIdentifier(repoUrlOrPath?: string): string {
  if (!repoUrlOrPath || typeof repoUrlOrPath !== 'string') return '';
  let cleaned = repoUrlOrPath.trim();
  cleaned = cleaned.replace(/^ssh:\/\/git@github\.com\//i, '');
  cleaned = cleaned.replace(/^git@github\.com:/i, '');
  cleaned = cleaned.replace(/^https?:\/\/github\.com\//i, '');
  cleaned = cleaned.replace(/\.git$/i, '');
  cleaned = cleaned.replace(/^\/+|\/+$/g, '');
  return cleaned;
}

export function validateTestCommand(cmd?: string): { file: string; args: string[] } {
  if (!cmd || typeof cmd !== 'string' || cmd.trim().length === 0) {
    throw new Error('Invalid test command: command must be a non-empty string');
  }
  const trimmed = cmd.trim();
  if (trimmed.length > 512 || trimmed.includes('\0')) {
    throw new Error('Invalid test command: exceeds maximum length or contains null bytes');
  }
  // Disallow shell operators / piping / chaining / redirection / command substitution
  if (/[;&|`$<>()\\]/.test(trimmed) || /[\r\n]/.test(trimmed)) {
    throw new Error(`Disallowed test command "${cmd}": shell operators, piping, and chaining are strictly forbidden.`);
  }

  // Parse space-delimited tokens safely
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const binary = tokens[0];
  const args = tokens.slice(1);
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

  // Block dangerous flags that transform a test runner into arbitrary code execution
  const FORBIDDEN_FLAGS = new Set([
    '-e',
    '--eval',
    '-p',
    '--print',
    '-c',
    '--call',
    '--require',
    '-r',
    '--import',
    '--loader',
    '--experimental-loader',
    '--inspect',
    '--inspect-brk',
    '--input-type',
    '--conditions',
    '--prof',
    '--test-reporter',
  ]);
  for (const arg of args) {
    const flagName = arg.split('=')[0];
    if (FORBIDDEN_FLAGS.has(flagName) || flagName.startsWith('--eval=') || flagName.startsWith('--require=')) {
      throw new Error(`Disallowed test command argument "${arg}" in "${cmd}"`);
    }
  }

  if ((binary === 'npm' || binary === 'yarn' || binary === 'pnpm') && args.length > 0) {
    const sub = args[0];
    if (sub === 'exec' || sub === 'dlx' || sub === 'config' || sub === 'publish' || sub === 'install' || sub === 'i' || sub === 'add') {
      throw new Error(`Disallowed ${binary} subcommand "${sub}" in test command`);
    }
  }

  // Disallow absolute file paths or path traversal in script targets for node/tsx
  if (binary === 'node' || binary === 'tsx') {
    for (const arg of args) {
      if (!arg.startsWith('-')) {
        if (arg.includes('..') || arg.startsWith('/') || /^[a-zA-Z]:/.test(arg)) {
          throw new Error(`Disallowed script path "${arg}" in ${binary} test command`);
        }
      }
    }
  }

  return {
    file: binary,
    args,
  };
}

const ALLOWED_EXECUTOR_BINARIES = new Set([
  'git',
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
]);

export class RealGitExecutor implements IGitExecutor {
  public async exec(command: string, cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const trimmed = (command || '').trim();
    if (!trimmed) {
      throw new Error('Command cannot be empty');
    }
    if (/[;&|`$<>()\\]/.test(trimmed)) {
      throw new Error(`Command "${command}" contains forbidden shell metacharacters`);
    }
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const file = tokens[0];
    const args = tokens.slice(1);
    return this.execFile(file, args, { cwd, env: env as NodeJS.ProcessEnv });
  }

  public async execFile(file: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cleanFile = (file || '').trim();
    if (!cleanFile) {
      throw new Error('Executable file cannot be empty');
    }

    if (!ALLOWED_EXECUTOR_BINARIES.has(cleanFile)) {
      throw new Error(`Disallowed executable "${cleanFile}". Execution blocked.`);
    }

    const cwd = options?.cwd;
    if (cleanFile === 'git') {
      if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
        throw new Error('Working directory (cwd) must be explicitly provided for Git execution (no process.cwd fallback allowed)');
      }
      for (const arg of args) {
        if (
          arg.startsWith('--upload-pack=') ||
          arg.startsWith('--receive-pack=') ||
          arg.startsWith('--exec=') ||
          arg.includes('core.fsmonitor') ||
          arg.includes('core.sshCommand') ||
          arg.includes('credential.helper') ||
          arg.includes('diff.external')
        ) {
          throw new Error(`Dangerous Git option forbidden: ${arg}`);
        }
      }
    }

    try {
      const res = await execFileAsync(cleanFile, args, {
        cwd: cwd ? cwd.trim() : undefined,
        env: { ...process.env, ...options?.env, GIT_TERMINAL_PROMPT: '0' },
      });
      return {
        stdout: typeof res.stdout === 'string' ? res.stdout : String(res.stdout || ''),
        stderr: typeof res.stderr === 'string' ? res.stderr : String(res.stderr || ''),
        exitCode: 0,
      };
    } catch (err: any) {
      const exitCode = typeof err.code === 'number' ? err.code : (typeof err.status === 'number' ? err.status : 1);
      const stdout = typeof err.stdout === 'string' ? err.stdout : String(err.stdout || '');
      const stderr = typeof err.stderr === 'string' ? err.stderr : (err.message || String(err || ''));
      return {
        stdout,
        stderr,
        exitCode,
      };
    }
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

  public async runGit(args: string[], cwd?: string, token?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      let res: { stdout: string; stderr: string; exitCode: number };
      if (this.executor.execFile) {
        res = await this.executor.execFile('git', args, { cwd });
      } else {
        const cmd = `git ${args.map(a => (a.includes(' ') || a.includes('"') ? JSON.stringify(a) : a)).join(' ')}`;
        res = await this.executor.exec(cmd, cwd);
      }
      if (typeof res.exitCode === 'number' && res.exitCode !== 0) {
        const err = new Error(res.stderr || `Git command failed with exit code ${res.exitCode}`);
        (err as any).stdout = res.stdout;
        (err as any).stderr = res.stderr;
        (err as any).code = res.exitCode;
        throw err;
      }
      return res;
    } catch (err: any) {
      const sanitizedMsg = sanitizeGitOutput(err.message || String(err), token);
      const safeErr = new Error(sanitizedMsg);
      (safeErr as any).stdout = sanitizeGitOutput(err.stdout || '', token);
      (safeErr as any).stderr = sanitizeGitOutput(err.stderr || '', token);
      (safeErr as any).code = typeof err.code === 'number' ? err.code : (typeof err.exitCode === 'number' ? err.exitCode : 1);
      throw safeErr;
    }
  }

  /**
   * Get git diff of working tree against HEAD or index
   */
  public async getDiff(cwd?: string): Promise<string> {
    try {
      const res = await this.runGit(['diff', 'HEAD'], cwd);
      return res.stdout;
    } catch {
      try {
        const res = await this.runGit(['diff'], cwd);
        return res.stdout;
      } catch {
        return '';
      }
    }
  }

  /**
   * Verify whether a working directory exists and is a valid Git checkout matching expected repository.
   * Strictly blocking:
   * - Must be inside git work tree.
   * - If expectedRepo is provided, remote.origin.url must be set and match exactly after normalization.
   * - Mismatch or missing origin when expectedRepo is requested strictly yields isValid=false.
   */
  public async verifyGitRepository(
    cwd: string,
    expectedRepo?: string
  ): Promise<{ isValid: boolean; error?: string; repoUrl?: string; isInsideWorkTree?: boolean }> {
    try {
      const res = await this.runGit(['rev-parse', '--is-inside-work-tree'], cwd);
      if (res.stdout.trim() !== 'true') {
        return {
          isValid: false,
          error: `Directory "${cwd}" is not inside a git work tree.`,
        };
      }

      let repoUrl = '';
      try {
        const originRes = await this.runGit(['config', '--get', 'remote.origin.url'], cwd);
        repoUrl = originRes.stdout.trim();
      } catch {
        // remote.origin.url might not be set for local testing repos
      }

      if (expectedRepo) {
        if (!repoUrl) {
          return {
            isValid: false,
            error: `remote.origin.url is not configured in git repository at "${cwd}" (expected repository "${expectedRepo}").`,
          };
        }

        const normExpected = normalizeRepoIdentifier(expectedRepo);
        const normOrigin = normalizeRepoIdentifier(repoUrl);

        if (normExpected.toLowerCase() !== normOrigin.toLowerCase()) {
          return {
            isValid: false,
            error: `Repository mismatch: expected "${expectedRepo}" (${normExpected}) but remote origin is "${repoUrl}" (${normOrigin}).`,
            repoUrl,
          };
        }
      }

      return {
        isValid: true,
        isInsideWorkTree: true,
        repoUrl,
      };
    } catch (err: any) {
      return {
        isValid: false,
        error: `Failed to verify git repository at "${cwd}": ${err.message}`,
      };
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
   * 
   * Strict Exit Code Authority:
   *   0            => PASS
   *   non-zero     => FAIL
   *   exception    => FAIL
   *   unknown code => FAIL
   */
  public async runVerificationTests(
    testCommand: string = 'npm test',
    cwd?: string
  ): Promise<{ passed: boolean; output: string; exitCode: number }> {
    try {
      const { file, args } = validateTestCommand(testCommand);
      let stdout = '';
      let stderr = '';
      let exitCode: number | undefined;

      if (this.executor.execFile) {
        const res = await this.executor.execFile(file, args, { cwd });
        stdout = res.stdout;
        stderr = res.stderr;
        exitCode = typeof res.exitCode === 'number' ? res.exitCode : undefined;
      } else {
        const safeCmd = [file, ...args].join(' ');
        const res = await this.executor.exec(safeCmd, cwd);
        stdout = res.stdout;
        stderr = res.stderr;
        exitCode = typeof res.exitCode === 'number' ? res.exitCode : undefined;
      }

      const fullOutput = `${stdout}\n${stderr}`.trim();
      const passed = exitCode === 0;

      return {
        passed,
        output: fullOutput || (passed ? 'Tests completed successfully (exit code 0)' : `Tests failed (exit code: ${exitCode ?? 'unknown'})`),
        exitCode: exitCode ?? (passed ? 0 : 1),
      };
    } catch (err: any) {
      const exitCode = typeof err.code === 'number' ? err.code : (typeof err.exitCode === 'number' ? err.exitCode : 1);
      return {
        passed: false,
        output: err.stdout ? `${err.stdout}\n${err.stderr}` : (err.message || 'Test execution failed'),
        exitCode,
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
    if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
      throw new Error('Working directory (cwd) must be explicitly provided for Git commit (no process.cwd fallback allowed)');
    }

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
    if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
      throw new Error('Working directory (cwd) must be explicitly provided for Git push (no process.cwd fallback allowed)');
    }
    const remote = options.remote || 'origin';

    validateBranchName(options.branch);
    validateRepoIdentifier(options.owner, 'Owner');
    validateRepoIdentifier(options.repo, 'Repository');

    const ALLOWED_REPOSITORIES = ['MohamedGH/agentTeam'];
    const targetSlug = `${options.owner.trim()}/${options.repo.trim()}`;
    if (!ALLOWED_REPOSITORIES.includes(targetSlug)) {
      throw new Error(
        `Git push forbidden: repository "${targetSlug}" is not in the authorized repository allowlist (${ALLOWED_REPOSITORIES.join(', ')})`
      );
    }

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
