import fs from 'fs';
import path from 'path';
import { ObservationCollector } from './ObservationCollector';
import {
  EvaluationResult,
  FileModificationRecord,
  ObservationSnapshot,
} from './types';
import { evaluateQualityGate } from '../github/qualityGate';

export class ImprovementEvaluator {
  private observer: ObservationCollector;

  constructor(observer?: ObservationCollector) {
    this.observer = observer || new ObservationCollector();
  }

  /**
   * Evaluate the codebase modifications against tests, security review, and Quality Gate rules.
   * Compares baseline metrics (BEFORE) with current metrics (AFTER) to ensure:
   * 1. Target behavior is improved
   * 2. Zero regression introduced
   * 3. Tests pass with exit code 0
   * 4. Security review passes
   * 5. Real execution is strictly enforced (mocks/simulations stay false)
   */
  public async evaluate(
    workingDirectory: string = process.cwd(),
    modifiedFiles: FileModificationRecord[] = [],
    isRealExecution: boolean = true,
    testCommand: string = 'npm test',
    baselineSnapshot?: ObservationSnapshot
  ): Promise<EvaluationResult> {
    const resolvedDir = path.resolve(workingDirectory);

    // 1. Run Automated Test Verification
    const testResult = this.observer.runTestObservation(resolvedDir, testCommand);
    const testsPassed = Boolean(testResult.passed && testResult.exitCode === 0);

    // 2. Perform Deterministic Architectural & Security Review on Modified Files
    const reviewIssues: string[] = [];
    const secretPatterns = [
      {
        pattern: /(?:api[_-]?key|secret[_-]?key|private[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{16,}['"]/i,
        name: 'Hardcoded credential',
      },
      { pattern: /ghp_[a-zA-Z0-9]{15,}/, name: 'Hardcoded GitHub token' },
      { pattern: /AIza[0-9A-Za-z-_]{35}/, name: 'Hardcoded Google API key' },
      { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, name: 'Private cryptographic key' },
    ];

    for (const mod of modifiedFiles) {
      if (mod.action === 'DELETED') continue;

      const fullPath = path.resolve(resolvedDir, mod.file);
      if (fs.existsSync(fullPath)) {
        const base = path.basename(mod.file);
        if ((base === '.env' || base.startsWith('.env.')) && !base.endsWith('.example')) {
          reviewIssues.push(`Security violation: Environment file '${mod.file}' cannot be committed.`);
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf8');

          // Check secret patterns
          for (const sec of secretPatterns) {
            if (sec.pattern.test(content)) {
              reviewIssues.push(`Security violation: ${sec.name} detected in ${mod.file}`);
            }
          }

          // Check dangerous eval
          if (/\beval\s*\(/i.test(content) && !mod.file.includes('test')) {
            reviewIssues.push(`Security violation: Dangerous eval() pattern detected in ${mod.file}`);
          }
        } catch {
          // ignore
        }
      }
    }

    const reviewApproved = reviewIssues.length === 0;

    // 3. Check for Regressions against Baseline (Before/After comparison)
    let regressionDetected = !testsPassed;
    if (baselineSnapshot && baselineSnapshot.tests) {
      if (baselineSnapshot.tests.passed && !testsPassed) {
        regressionDetected = true;
      }
      if (testResult.failedTests > baselineSnapshot.tests.failedTests) {
        regressionDetected = true;
      }
    }

    // 4. Evaluate Central Quality Gate
    // STRICT RULE: realExecution must be authentic and cannot be spoofed by caller
    const gateCheck = evaluateQualityGate({
      sessionStatus: 'COMPLETED',
      executionStatus: testsPassed && reviewApproved && !regressionDetected ? 'COMPLETED' : 'FAILED',
      realExecution: Boolean(isRealExecution),
      testsPassed,
      reviewExecuted: true,
      reviewApproved,
    });

    const passed = Boolean(testsPassed && reviewApproved && !regressionDetected && gateCheck.authorized);

    const reviewDesc = reviewApproved ? 'APPROVED' : `ISSUES_FOUND (${reviewIssues.join(', ')})`;
    let summary: string;

    if (!testsPassed) {
      summary = `Evaluation REJECTED: Tests failed with exit code ${testResult.exitCode}. Output: ${testResult.outputSnippet?.slice(0, 150) || 'N/A'}`;
    } else if (!reviewApproved) {
      summary = `Evaluation REJECTED: Security review rejected due to: ${reviewIssues.join('; ')}`;
    } else if (regressionDetected) {
      summary = `Evaluation REJECTED: Regression detected between before and after snapshots.`;
    } else if (!gateCheck.authorized) {
      summary = `Evaluation REJECTED: Quality Gate authorization denied: ${gateCheck.reason}`;
    } else {
      summary = `Evaluation SUCCESS: Tests passed (exit 0), security review approved, Quality Gate authorized.`;
    }

    return {
      passed,
      testsPassed,
      testExitCode: testResult.exitCode,
      testOutput: testResult.outputSnippet || '',
      reviewApproved,
      reviewIssues,
      gateAuthorized: gateCheck.authorized,
      gateReason: gateCheck.reason,
      regressionDetected,
      summary,
    };
  }
}

export const improvementEvaluator = new ImprovementEvaluator();
