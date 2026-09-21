import {
  ObservationSnapshot,
  DetectedProblem,
  ProblemSeverity,
  ProblemCategory,
} from './types';

export class ProblemDetector {
  /**
   * Analyze an observation snapshot and detect prioritized problems.
   */
  public detect(snapshot: ObservationSnapshot): DetectedProblem[] {
    const problems: DetectedProblem[] = [];

    // 1. Detect Test Failures
    const testProblems = this.detectTestFailures(snapshot);
    problems.push(...testProblems);

    // 2. Detect Build & Lint Failures
    const buildProblems = this.detectBuildFailures(snapshot);
    problems.push(...buildProblems);

    const lintProblems = this.detectLintFailures(snapshot);
    problems.push(...lintProblems);

    // 3. Detect Security Vulnerabilities
    const securityProblems = this.detectSecurityVulnerabilities(snapshot);
    problems.push(...securityProblems);

    // 4. Detect Code Smells and Technical Debt
    const smellProblems = this.detectCodeSmells(snapshot);
    problems.push(...smellProblems);

    // 5. Detect Runtime & Provider Health Issues
    const healthProblems = this.detectRuntimeHealthIssues(snapshot);
    problems.push(...healthProblems);

    // 6. Detect Agent Recurring Failures
    const agentProblems = this.detectAgentFailures(snapshot);
    problems.push(...agentProblems);

    // 7. Detect Git repository anomalies
    const gitProblems = this.detectGitAnomalies(snapshot);
    problems.push(...gitProblems);

    // 8. Detect LLM Empirical Anomalies
    const llmProblems = this.detectLLMAnomalies(snapshot);
    problems.push(...llmProblems);

    // Prioritize problems deterministically (functional sort)
    return this.prioritizeProblems(problems);
  }

  public detectLLMAnomalies(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.llmMetrics || !snapshot.llmMetrics.anomalies || snapshot.llmMetrics.anomalies.length === 0) {
      return [];
    }

    return snapshot.llmMetrics.anomalies.map((anom, idx) => ({
      id: `prob_llm_${anom.type.toLowerCase()}_${idx}_${snapshot.id.slice(-6)}`,
      category: 'RUNTIME_ERROR' as any,
      severity: anom.type === 'SUSTAINED_LOW_SUCCESS' ? 'HIGH' : 'MEDIUM',
      title: `LLM Routing Anomaly: ${anom.type} on ${anom.modelId}`,
      description: anom.details,
      targetFiles: ['server/llm/LLMSelector.ts', 'server/llm/LLMRankingEngine.ts'],
      suggestedFix: `Apply adaptive self-improvement plan for anomaly ${anom.type} (e.g. cooldown or exploration boost).`,
      confidence: 0.9,
      sourceSnapshotId: snapshot.id,
    }));
  }

  public detectTestFailures(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.tests || snapshot.tests.passed) return [];

    return [
      {
        id: `prob_test_${snapshot.id.slice(-6)}`,
        category: 'TEST_FAILURE',
        severity: 'CRITICAL',
        title: `Automated test suite failed with exit code ${snapshot.tests.exitCode}`,
        description: `Command '${snapshot.tests.command}' failed (${snapshot.tests.failedTests} failed / ${snapshot.tests.totalTests} total). Snippet: ${snapshot.tests.outputSnippet?.slice(0, 200) || 'Unknown test failure'}`,
        targetFiles: this.extractFilesFromSnippet(snapshot.tests.outputSnippet || ''),
        suggestedFix:
          'Inspect failing assertions in test suite, patch breaking implementation or fix regression.',
        confidence: 0.95,
        sourceSnapshotId: snapshot.id,
      },
    ];
  }

  public detectBuildFailures(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.build || snapshot.build.passed) return [];

    return [
      {
        id: `prob_build_${snapshot.id.slice(-6)}`,
        category: 'BUILD_FAILURE',
        severity: 'CRITICAL',
        title: `Application build failure with exit code ${snapshot.build.exitCode}`,
        description: `Build command '${snapshot.build.command}' failed. Output: ${snapshot.build.outputSnippet?.slice(0, 200) || 'Build compilation error.'}`,
        targetFiles: this.extractFilesFromSnippet(snapshot.build.outputSnippet || ''),
        suggestedFix: 'Fix syntax, type mismatches, or missing exports causing build breakdown.',
        confidence: 0.95,
        sourceSnapshotId: snapshot.id,
      },
    ];
  }

  public detectLintFailures(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.lint || snapshot.lint.passed) return [];

    return [
      {
        id: `prob_lint_${snapshot.id.slice(-6)}`,
        category: 'LINT_FAILURE',
        severity: 'MEDIUM',
        title: `Linter detected static violations with exit code ${snapshot.lint.exitCode}`,
        description: `Command '${snapshot.lint.command}' reported lint errors. Snippet: ${snapshot.lint.outputSnippet?.slice(0, 200) || 'Lint violations'}`,
        targetFiles: this.extractFilesFromSnippet(snapshot.lint.outputSnippet || ''),
        suggestedFix: 'Apply linter fixes and correct stylistic / formatting violations.',
        confidence: 0.85,
        sourceSnapshotId: snapshot.id,
      },
    ];
  }

  public detectSecurityVulnerabilities(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.security?.issues) return [];

    return snapshot.security.issues.map((sec, idx) => ({
      id: `prob_sec_${snapshot.id.slice(-4)}_${idx}`,
      category: 'SECURITY_VULNERABILITY',
      severity: sec.severity,
      title: `Security Violation: ${sec.rule} in ${sec.file}`,
      description: `${sec.description} at line ${sec.line || 'unknown'}: ${sec.snippet || ''}`.trim(),
      targetFiles: [sec.file],
      suggestedFix: `Remove hardcoded secret or unsafe operation from ${sec.file} and reference environment configuration safely.`,
      confidence: 0.99,
      sourceSnapshotId: snapshot.id,
    }));
  }

  public detectCodeSmells(snapshot: ObservationSnapshot): DetectedProblem[] {
    const problems: DetectedProblem[] = [];

    if (snapshot.codeStats?.todoCount > 10) {
      problems.push({
        id: `prob_smell_todo_${snapshot.id.slice(-4)}`,
        category: 'CODE_SMELL',
        severity: 'LOW',
        title: `High accumulation of unresolved TODO markers (${snapshot.codeStats.todoCount})`,
        description: `Found ${snapshot.codeStats.todoCount} TODO/FIXME markers in codebase.`,
        targetFiles: Array.from(new Set(snapshot.codeSmells.map((s) => s.file))).slice(0, 5),
        suggestedFix:
          'Resolve or document pending TODO implementations in high-priority files.',
        confidence: 0.7,
        sourceSnapshotId: snapshot.id,
      });
    }

    return problems;
  }

  public detectRuntimeHealthIssues(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (snapshot.runtimeHealth && snapshot.runtimeHealth.providerFailovers > 5) {
      return [
        {
          id: `prob_health_failover_${snapshot.id.slice(-4)}`,
          category: 'PERFORMANCE_ISSUE',
          severity: 'HIGH',
          title: `Frequent Provider Failovers Detected (${snapshot.runtimeHealth.providerFailovers} failovers)`,
          description: `Provider health is degraded. Last error: ${snapshot.runtimeHealth.lastError || 'Repeated rate limit / quota exhaustion'}.`,
          targetFiles: ['server/providerManager.ts', 'server/quotaManager.ts'],
          suggestedFix: 'Implement adaptive backoff and verify quota management state.',
          confidence: 0.85,
          sourceSnapshotId: snapshot.id,
        },
      ];
    }
    return [];
  }

  public detectAgentFailures(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.agentMetrics) return [];
    if (snapshot.agentMetrics.failureCount > 3 || snapshot.agentMetrics.successRate < 0.5) {
      return [
        {
          id: `prob_agent_fail_${snapshot.id.slice(-4)}`,
          category: 'AGENT_RECURRING_FAILURE',
          severity: 'HIGH',
          title: `Agent Recurring Failures (${snapshot.agentMetrics.failureCount} failures, ${(snapshot.agentMetrics.successRate * 100).toFixed(0)}% success rate)`,
          description: `Coding agent is experiencing persistent errors. Last error: ${snapshot.agentMetrics.lastError || 'Task execution failure'}.`,
          targetFiles: ['server/codingAgents/codingAgentManager.ts'],
          suggestedFix: 'Review agent prompt construction, tool bindings, and error retry policy.',
          confidence: 0.88,
          sourceSnapshotId: snapshot.id,
        },
      ];
    }
    return [];
  }

  public detectGitAnomalies(snapshot: ObservationSnapshot): DetectedProblem[] {
    if (!snapshot.git) return [];
    if (snapshot.git.uncommittedFiles && snapshot.git.uncommittedFiles.length > 25) {
      return [
        {
          id: `prob_git_dirty_${snapshot.id.slice(-4)}`,
          category: 'GIT_ERROR',
          severity: 'MEDIUM',
          title: `Workspace Heavily Unclean (${snapshot.git.uncommittedFiles.length} uncommitted files)`,
          description: 'Large amount of untracked or modified files in working directory.',
          targetFiles: snapshot.git.uncommittedFiles.slice(0, 5),
          suggestedFix: 'Clean up temporary build artifacts or configure .gitignore properly.',
          confidence: 0.75,
          sourceSnapshotId: snapshot.id,
        },
      ];
    }
    return [];
  }

  public prioritizeProblems(problems: DetectedProblem[]): DetectedProblem[] {
    const severityWeight: Record<ProblemSeverity, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    return [...problems].sort((a, b) => {
      const weightDiff = severityWeight[b.severity] - severityWeight[a.severity];
      if (weightDiff !== 0) return weightDiff;
      const confDiff = b.confidence - a.confidence;
      if (confDiff !== 0) return confDiff;
      return a.title.localeCompare(b.title);
    });
  }

  private extractFilesFromSnippet(snippet: string): string[] {
    const fileMatches = snippet.match(
      /(?:at\s+|FAIL\s+|in\s+)([\w\-./\\]+\.(?:ts|tsx|js|jsx|py))/gi
    );
    if (!fileMatches) return [];

    const extracted = fileMatches
      .map((m) => m.replace(/^(?:at\s+|FAIL\s+|in\s+)/i, '').trim())
      .filter((f) => !f.includes('node_modules'));

    return Array.from(new Set(extracted)).slice(0, 5);
  }
}

export const problemDetector = new ProblemDetector();
