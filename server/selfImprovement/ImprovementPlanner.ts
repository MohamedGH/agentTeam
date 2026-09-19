import {
  DetectedProblem,
  ImprovementPlan,
  PlanStep,
  PlanRiskLevel,
} from './types';

export class ImprovementPlanner {
  /**
   * Produce a concrete, actionable improvement plan for a given problem.
   */
  public plan(problem: DetectedProblem, testCommand: string = 'npm test'): ImprovementPlan {
    const id = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const riskLevel: PlanRiskLevel =
      problem.severity === 'CRITICAL' ? 'HIGH' : problem.severity === 'HIGH' ? 'MEDIUM' : 'LOW';

    const steps = this.generatePlanSteps(problem);
    const targetFiles =
      problem.targetFiles.length > 0 ? problem.targetFiles : ['package.json'];

    const probableCause = this.determineProbableCause(problem);
    const proposedImprovement = this.determineProposedImprovement(problem);
    const successCriteria = this.determineSuccessCriteria(problem, testCommand);
    const requiredTests = this.determineRequiredTests(problem, testCommand);
    const risks = this.determineRisks(problem, riskLevel);
    const rollbackStrategy =
      'Restore atomic file backups created before execution if verification tests fail, review is rejected, or quality gate is not met.';

    return {
      id,
      problemId: problem.id,
      problemTitle: problem.title,
      title: `Fix ${problem.category}: ${problem.title}`,
      objective: `Resolve ${problem.category} reported in "${problem.title}". Verified via '${testCommand}'.`,
      probableCause,
      proposedImprovement,
      riskLevel,
      steps,
      verificationCommand: testCommand,
      targetFiles,
      successCriteria,
      requiredTests,
      risks,
      rollbackStrategy,
      createdAt,
    };
  }

  private determineProbableCause(problem: DetectedProblem): string {
    switch (problem.category) {
      case 'TEST_FAILURE':
      case 'TEST_REGRESSION':
        return `Broken assertion, unexpected side-effect, or logic defect causing test runner exit failure.`;
      case 'BUILD_FAILURE':
        return `TypeScript compilation failure, missing export, or invalid module syntax.`;
      case 'LINT_FAILURE':
        return `Non-compliant formatting, unused variable, or linter rule breach.`;
      case 'SECURITY_VULNERABILITY':
        return `Hardcoded API token or insecure code structure committed into source files.`;
      case 'CODE_SMELL':
        return `Accumulation of technical debt or unfinished TODO/FIXME markers.`;
      case 'PERFORMANCE_ISSUE':
      case 'AGENT_RECURRING_FAILURE':
        return `Repeated downstream API errors, rate limiting, or inadequate retry backoff.`;
      case 'GIT_ERROR':
        return `Accumulation of untracked files or inconsistent git repository index.`;
      default:
        return `Identified deficiency in codebase or configuration.`;
    }
  }

  private determineProposedImprovement(problem: DetectedProblem): string {
    return problem.suggestedFix || `Apply targeted patch to resolve ${problem.title}.`;
  }

  private determineSuccessCriteria(problem: DetectedProblem, testCommand: string): string[] {
    return [
      `Automated verification command '${testCommand}' exits with code 0.`,
      `Zero security issues or exposed credentials in modified files.`,
      `Quality Gate authorizes delivery (isRealExecution=true, review approved, zero regressions).`,
      `Target issue "${problem.title}" is eliminated in post-observation.`,
    ];
  }

  private determineRequiredTests(problem: DetectedProblem, testCommand: string): string[] {
    return [
      testCommand,
      'Architectural and security static analysis on modified files',
      'Quality Gate verification',
    ];
  }

  private determineRisks(problem: DetectedProblem, riskLevel: PlanRiskLevel): string[] {
    const risks: string[] = [];
    if (riskLevel === 'HIGH') {
      risks.push('High-severity fix may modify critical paths; requires strict isolated backup.');
    }
    if (problem.category === 'SECURITY_VULNERABILITY') {
      risks.push('Risk of breaking dependent modules relying on hardcoded environment values.');
    }
    if (problem.category === 'TEST_FAILURE') {
      risks.push('Risk of fixing symptom instead of underlying architectural cause.');
    }
    if (risks.length === 0) {
      risks.push('Minimal regression risk; isolated file modification.');
    }
    return risks;
  }

  private generatePlanSteps(problem: DetectedProblem): PlanStep[] {
    const files = problem.targetFiles.length > 0 ? problem.targetFiles : ['src/index.ts'];

    switch (problem.category) {
      case 'TEST_FAILURE':
      case 'TEST_REGRESSION':
        return files.map((file, idx) => ({
          stepNumber: idx + 1,
          description: `Fix failing test assertion or logic defect in ${file}`,
          targetFile: file,
          action: 'MODIFY',
          validationCheck: 'Run automated test runner and verify zero test assertion failures.',
        }));

      case 'BUILD_FAILURE':
        return files.map((file, idx) => ({
          stepNumber: idx + 1,
          description: `Repair syntax or type error in ${file}`,
          targetFile: file,
          action: 'MODIFY',
          validationCheck: 'Run build command and verify zero compiler errors.',
        }));

      case 'LINT_FAILURE':
        return files.map((file, idx) => ({
          stepNumber: idx + 1,
          description: `Correct lint violation in ${file}`,
          targetFile: file,
          action: 'MODIFY',
          validationCheck: 'Run linter and confirm clean report.',
        }));

      case 'SECURITY_VULNERABILITY':
        return files.map((file, idx) => ({
          stepNumber: idx + 1,
          description: `Sanitize exposed credential or unsafe operation in ${file}`,
          targetFile: file,
          action: 'MODIFY',
          validationCheck: 'Verify that all credentials are delegated to environment variables.',
        }));

      case 'CODE_SMELL':
        return files.map((file, idx) => ({
          stepNumber: idx + 1,
          description: `Refactor code smell / clean debt in ${file}`,
          targetFile: file,
          action: 'MODIFY',
          validationCheck: 'Verify code passes linter and tests.',
        }));

      default:
        return [
          {
            stepNumber: 1,
            description: `Apply targeted improvements to resolve: ${problem.title}`,
            targetFile: files[0],
            action: 'MODIFY',
            validationCheck: 'Verify application compiles and passes tests.',
          },
        ];
    }
  }
}

export const improvementPlanner = new ImprovementPlanner();
