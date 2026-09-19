import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  ObservationSnapshot,
  SecurityIssue,
  CodeSmell,
  TestMetric,
  BuildMetric,
  LintMetric,
} from './types';
import { providerManager } from '../providerManager';

export interface ObserverConfig {
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  maxFilesToScan?: number;
}

export class ObservationCollector {
  private config: ObserverConfig;

  constructor(config: ObserverConfig = {}) {
    this.config = config;
  }

  /**
   * Validate and sanitize command to prevent arbitrary shell injection.
   */
  private validateSafeCommand(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) {
      throw new Error('Command cannot be empty');
    }
    // Block dangerous chaining operators
    if (/[\;&\|`\$\>\<]/.test(trimmed)) {
      // Allow standard node -e or npm test, but block malicious chaining
      const parts = trimmed.split(/\s+/);
      const main = parts[0];
      const isNodeEval = main === 'node' && trimmed.includes('-e');
      if (!isNodeEval && /[\;&\|`\$\>\<]/.test(trimmed)) {
        throw new Error(`Command '${command}' contains forbidden shell metacharacters.`);
      }
    }
  }

  /**
   * Capture a full telemetry observation snapshot of the codebase & runtime.
   */
  public async observe(
    workingDirectory: string = process.cwd(),
    repository: string = 'MohamedGH/agentTeam',
    branch: string = 'main'
  ): Promise<ObservationSnapshot> {
    const resolvedDir = path.resolve(workingDirectory);
    const id = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const testMetric = this.runTestObservation(resolvedDir);
    const buildMetric = this.runBuildObservation(resolvedDir);
    const lintMetric = this.runLintObservation(resolvedDir);
    const { codeStats, securityIssues, codeSmells } = this.scanCodebase(resolvedDir);
    const gitStatus = this.checkGitStatus(resolvedDir);
    const runtimeHealth = this.checkRuntimeHealth();

    return {
      id,
      timestamp,
      workingDirectory: resolvedDir,
      repository,
      branch,
      tests: testMetric,
      build: buildMetric,
      lint: lintMetric,
      codeStats,
      security: {
        issues: securityIssues,
        clean: securityIssues.length === 0,
      },
      codeSmells,
      git: gitStatus,
      runtimeHealth,
    };
  }

  /**
   * Run automated tests and collect performance & pass/fail statistics.
   */
  public runTestObservation(workingDir: string, overrideCommand?: string): TestMetric {
    const testCmd = overrideCommand || this.config.testCommand || 'npm test';
    const startTime = Date.now();

    try {
      if (!fs.existsSync(workingDir)) {
        return {
          command: testCmd,
          passed: false,
          exitCode: 1,
          totalTests: 0,
          passedTests: 0,
          failedTests: 1,
          outputSnippet: `Directory does not exist: ${workingDir}`,
          durationMs: Date.now() - startTime,
        };
      }

      this.validateSafeCommand(testCmd);

      // If testCmd is an npm command and package.json doesn't exist in workingDir, skip
      if (testCmd.startsWith('npm') && !fs.existsSync(path.join(workingDir, 'package.json'))) {
        return {
          command: testCmd,
          passed: true,
          exitCode: 0,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          outputSnippet: 'No package.json found; skipping test execution.',
          durationMs: Date.now() - startTime,
        };
      }

      const output = execSync(testCmd, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 25000,
        env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
      });

      const parsed = this.parseTestOutput(output);
      return {
        command: testCmd,
        passed: true,
        exitCode: 0,
        totalTests: parsed.total,
        passedTests: parsed.passed,
        failedTests: 0,
        outputSnippet: output.slice(-500),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || err.message || '';
      const combined = `${stdout}\n${stderr}`.trim();
      const parsed = this.parseTestOutput(combined);

      return {
        command: testCmd,
        passed: false,
        exitCode: typeof err.status === 'number' ? err.status : 1,
        totalTests: parsed.total || 1,
        passedTests: parsed.passed || 0,
        failedTests: Math.max(1, parsed.failed || 1),
        outputSnippet: combined.slice(-600),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run build observation if configured or script present.
   */
  public runBuildObservation(workingDir: string): BuildMetric | undefined {
    const pkgPath = path.join(workingDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return undefined;

    const buildCmd = this.config.buildCommand || 'npm run build';
    const startTime = Date.now();
    try {
      this.validateSafeCommand(buildCmd);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.scripts?.build) return undefined;

      const output = execSync(buildCmd, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        env: { ...process.env, NODE_ENV: 'production' },
      });

      return {
        command: buildCmd,
        passed: true,
        exitCode: 0,
        outputSnippet: output.slice(-300),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || err.message || '';
      return {
        command: buildCmd,
        passed: false,
        exitCode: typeof err.status === 'number' ? err.status : 1,
        outputSnippet: `${stdout}\n${stderr}`.slice(-400),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run lint observation if configured or script present.
   */
  public runLintObservation(workingDir: string): LintMetric | undefined {
    const pkgPath = path.join(workingDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return undefined;

    const lintCmd = this.config.lintCommand || 'npm run lint';
    const startTime = Date.now();
    try {
      this.validateSafeCommand(lintCmd);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.scripts?.lint) return undefined;

      const output = execSync(lintCmd, {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 25000,
      });

      return {
        command: lintCmd,
        passed: true,
        exitCode: 0,
        outputSnippet: output.slice(-300),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || err.message || '';
      return {
        command: lintCmd,
        passed: false,
        exitCode: typeof err.status === 'number' ? err.status : 1,
        outputSnippet: `${stdout}\n${stderr}`.slice(-400),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private parseTestOutput(output: string): { total: number; passed: number; failed: number } {
    let passed = 0;
    let failed = 0;

    const passMatches = output.match(/PASS|passed|✔|ok/gi);
    if (passMatches) passed = passMatches.length;

    const failMatches = output.match(/FAIL|failed|✖|AssertionError/gi);
    if (failMatches) failed = failMatches.length;

    return {
      total: passed + failed,
      passed,
      failed,
    };
  }

  /**
   * Statically scan the repository for code quality, security credentials, and smell patterns.
   */
  public scanCodebase(workingDir: string): {
    codeStats: { totalFiles: number; sourceFiles: number; testFiles: number; todoCount: number };
    securityIssues: SecurityIssue[];
    codeSmells: CodeSmell[];
  } {
    const securityIssues: SecurityIssue[] = [];
    const codeSmells: CodeSmell[] = [];
    let totalFiles = 0;
    let sourceFiles = 0;
    let testFiles = 0;
    let todoCount = 0;

    const secretPatterns = [
      {
        pattern: /(?:api[_-]?key|secret[_-]?key|private[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{16,}['"]/i,
        rule: 'CREDENTIAL_EXPOSED',
        desc: 'Hardcoded API or private secret key',
      },
      {
        pattern: /ghp_[a-zA-Z0-9]{15,}/,
        rule: 'GITHUB_PAT_EXPOSED',
        desc: 'Hardcoded GitHub personal access token',
      },
      {
        pattern: /AIza[0-9A-Za-z-_]{35}/,
        rule: 'GOOGLE_API_KEY_EXPOSED',
        desc: 'Hardcoded Google API key',
      },
      {
        pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
        rule: 'PRIVATE_KEY_EXPOSED',
        desc: 'Cryptographic private key in code',
      },
    ];

    const walkDir = (dir: string, depth = 0) => {
      if (depth > 6) return;
      if (!fs.existsSync(dir)) return;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workingDir, fullPath).replace(/\\/g, '/');

        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'data' ||
          entry.name.startsWith('.system_generated')
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          totalFiles++;

          const isTsJs = /\.(ts|tsx|js|jsx|py|json|md)$/i.test(entry.name);
          const isTest =
            /\.(test|spec)\.(ts|tsx|js)$/i.test(entry.name) || relPath.includes('tests/');

          if (isTsJs) sourceFiles++;
          if (isTest) testFiles++;

          // Security check: real .env file in source
          if (
            (entry.name === '.env' || entry.name.startsWith('.env.')) &&
            !entry.name.endsWith('.example')
          ) {
            securityIssues.push({
              file: relPath,
              rule: 'ENV_CREDENTIALS_COMMITTED',
              description: 'Environment file committed directly to workspace',
              severity: 'CRITICAL',
            });
          }

          // Scan content of textual source files
          if (isTsJs && fs.statSync(fullPath).size < 300000) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check secrets
                for (const sec of secretPatterns) {
                  if (sec.pattern.test(line)) {
                    securityIssues.push({
                      file: relPath,
                      line: i + 1,
                      rule: sec.rule,
                      description: sec.desc,
                      severity: 'CRITICAL',
                      snippet: line.trim().slice(0, 80),
                    });
                  }
                }

                // Check TODOs
                if (/\b(?:TODO|FIXME|XXX)\b/i.test(line)) {
                  todoCount++;
                  if (codeSmells.length < 20) {
                    codeSmells.push({
                      file: relPath,
                      line: i + 1,
                      type: 'TODO_OR_FIXME',
                      message: line.trim().slice(0, 100),
                    });
                  }
                }

                // Check dangerous eval
                if (/\beval\s*\(/i.test(line) && !relPath.includes('test')) {
                  securityIssues.push({
                    file: relPath,
                    line: i + 1,
                    rule: 'DANGEROUS_EVAL',
                    description: 'Insecure eval() invocation detected in production code',
                    severity: 'HIGH',
                    snippet: line.trim().slice(0, 80),
                  });
                }
              }
            } catch {
              // Ignore unreadable files
            }
          }
        }
      }
    };

    walkDir(workingDir);

    return {
      codeStats: {
        totalFiles,
        sourceFiles,
        testFiles,
        todoCount,
      },
      securityIssues,
      codeSmells,
    };
  }

  /**
   * Check working directory Git status.
   */
  public checkGitStatus(workingDir: string): {
    isGitRepo: boolean;
    clean: boolean;
    uncommittedFiles: string[];
    headSha?: string;
  } {
    try {
      if (!fs.existsSync(path.join(workingDir, '.git'))) {
        return { isGitRepo: false, clean: true, uncommittedFiles: [] };
      }

      const statusOutput = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      const uncommittedFiles = statusOutput
        .split('\n')
        .map((l) => l.trim().slice(3).trim())
        .filter((f) => f.length > 0);

      let headSha: string | undefined;
      try {
        headSha = execSync('git rev-parse HEAD', {
          cwd: workingDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        // May have no commits yet
      }

      return {
        isGitRepo: true,
        clean: uncommittedFiles.length === 0,
        uncommittedFiles,
        headSha,
      };
    } catch {
      return { isGitRepo: false, clean: true, uncommittedFiles: [] };
    }
  }

  /**
   * Check runtime health from server providers and quota.
   */
  public checkRuntimeHealth(): { providerFailovers: number; lastError?: string } {
    try {
      const pmAny = providerManager as any;
      const records =
        typeof pmAny.getFailoverHistory === 'function' ? pmAny.getFailoverHistory() : [];
      return {
        providerFailovers: records.length,
        lastError: records.length > 0 ? records[records.length - 1].reason : undefined,
      };
    } catch {
      return { providerFailovers: 0 };
    }
  }
}

export const observationCollector = new ObservationCollector();
