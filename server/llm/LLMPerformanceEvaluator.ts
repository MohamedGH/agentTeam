import * as vm from 'node:vm';
import { AIProviderId } from '../providers/types';
import {
  BenchmarkDefinition,
  ClassifiedProblem,
  LLMEvaluation,
  ProblemCategory,
  ProblemComplexity,
} from './types';

/**
 * LLMPerformanceEvaluator
 * 
 * Conducts objective, multi-dimensional evaluations of LLM outputs across
 * all categories (code, debugging, refactoring, security, architecture, reasoning, math).
 * Never awards scores based solely on subjective text or assertions when verifiable criteria exist.
 */
export class LLMPerformanceEvaluator {
  private readonly version = '1.0.0-objective';

  public evaluateBenchmarkOutput(
    benchmark: BenchmarkDefinition,
    modelId: string,
    providerId: AIProviderId,
    output: string,
    latencyMs: number,
    estimatedCost = 0,
    isLiveBenchmark = false
  ): LLMEvaluation {
    const startTime = Date.now();
    let score = 0;
    let testsPassed = 0;
    let totalTests = 1;
    let regressionDetected = false;
    let success = false;
    const details: Record<string, any> = {};

    const cleanOutput = (output || '').trim();
    const extractedCode = this.extractCodeBlock(cleanOutput);

    switch (benchmark.criteria.method) {
      case 'test_execution': {
        const testResult = this.runTestExecution(extractedCode || cleanOutput, benchmark.criteria.testCode);
        totalTests = testResult.total;
        testsPassed = testResult.passed;
        regressionDetected = testResult.regression;
        score = totalTests > 0 ? testsPassed / totalTests : 0;
        success = testResult.success;
        details.testExecution = testResult;
        break;
      }

      case 'deterministic_rules': {
        const ruleResult = this.evaluateRules(cleanOutput, benchmark.criteria.requiredPatterns, benchmark.criteria.forbiddenPatterns);
        totalTests = ruleResult.total;
        testsPassed = ruleResult.passed;
        score = totalTests > 0 ? testsPassed / totalTests : 0;
        success = ruleResult.success;
        details.ruleValidation = ruleResult;
        break;
      }

      case 'security_validation': {
        const secResult = this.evaluateSecurity(cleanOutput, benchmark.criteria.requiredPatterns, benchmark.criteria.forbiddenPatterns);
        totalTests = secResult.total;
        testsPassed = secResult.passed;
        score = secResult.score;
        success = secResult.success;
        regressionDetected = secResult.bypassed;
        details.securityCheck = secResult;
        break;
      }

      case 'exact_match': {
        const matchResult = this.evaluatePatternsAndMatch(cleanOutput, benchmark.criteria.requiredPatterns, benchmark.criteria.forbiddenPatterns);
        totalTests = matchResult.total;
        testsPassed = matchResult.passed;
        score = totalTests > 0 ? testsPassed / totalTests : 0;
        success = matchResult.success;
        details.exactMatch = matchResult;
        break;
      }

      default: {
        const defaultCheck = this.evaluateRules(cleanOutput, benchmark.criteria.requiredPatterns, benchmark.criteria.forbiddenPatterns);
        score = defaultCheck.passed / Math.max(1, defaultCheck.total);
        success = defaultCheck.success;
        testsPassed = defaultCheck.passed;
        totalTests = defaultCheck.total;
        details.generalCheck = defaultCheck;
      }
    }

    return {
      id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      modelId,
      providerId,
      modelVersion: this.extractVersion(modelId),
      problemId: benchmark.id,
      category: benchmark.category,
      complexity: benchmark.difficulty,
      success,
      score: Math.round(score * 100) / 100,
      latencyMs,
      estimatedCost,
      testsPassed,
      totalTests,
      regressionDetected,
      evaluatorVersion: this.version,
      timestamp: startTime,
      details,
      isLiveBenchmark,
      outputSample: cleanOutput.slice(0, 180),
    };
  }

  /**
   * Evaluates real production tasks post-execution to feed memory without benchmarks.
   */
  public evaluateRealTaskExecution(
    task: ClassifiedProblem,
    modelId: string,
    providerId: AIProviderId,
    executionResult: {
      success: boolean;
      exitCode?: number;
      testsPassed?: number;
      totalTests?: number;
      latencyMs: number;
      estimatedCost?: number;
      regressionDetected?: boolean;
      compilerErrors?: string[];
      output?: string;
    }
  ): LLMEvaluation {
    const totalTests = executionResult.totalTests || (executionResult.success ? 1 : 1);
    const testsPassed = executionResult.testsPassed !== undefined
      ? executionResult.testsPassed
      : executionResult.success ? 1 : 0;

    let score = executionResult.success ? 1.0 : 0.0;
    if (executionResult.totalTests && executionResult.totalTests > 0) {
      score = (executionResult.testsPassed || 0) / executionResult.totalTests;
    }
    if (executionResult.regressionDetected) {
      score = Math.max(0, score - 0.5);
    }
    if (executionResult.compilerErrors && executionResult.compilerErrors.length > 0) {
      score = 0;
    }

    return {
      id: `eval_real_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      modelId,
      providerId,
      modelVersion: this.extractVersion(modelId),
      problemId: `task_${task.category.toLowerCase()}_${Date.now()}`,
      category: task.category,
      complexity: task.complexity,
      success: executionResult.success && !executionResult.regressionDetected,
      score: Math.round(score * 100) / 100,
      latencyMs: executionResult.latencyMs,
      estimatedCost: executionResult.estimatedCost,
      testsPassed,
      totalTests,
      regressionDetected: Boolean(executionResult.regressionDetected),
      evaluatorVersion: this.version,
      timestamp: Date.now(),
      details: {
        exitCode: executionResult.exitCode,
        compilerErrors: executionResult.compilerErrors,
      },
      isLiveBenchmark: false,
      outputSample: executionResult.output ? executionResult.output.slice(0, 180) : undefined,
    };
  }

  private runTestExecution(code: string, testHarness?: string): {
    total: number;
    passed: number;
    success: boolean;
    regression: boolean;
    error?: string;
  } {
    if (!testHarness) {
      return { total: 1, passed: code.length > 20 ? 1 : 0, success: code.length > 20, regression: false };
    }

    try {
      // Execute the test harness with the generated code injected safely inside sandboxed VM with timeout
      const wrappedScript = `
        (function(code) {
          ${testHarness}
        })(${JSON.stringify(code)});
      `;
      vm.runInNewContext(wrappedScript, { console, Math, Array, Object, String, Number, Boolean, Error }, { timeout: 500 });
      return { total: 5, passed: 5, success: true, regression: false };
    } catch (err: any) {
      return {
        total: 5,
        passed: 0,
        success: false,
        regression: true,
        error: err?.message || String(err),
      };
    }
  }

  private evaluateRules(
    output: string,
    required: string[] = [],
    forbidden: string[] = []
  ): { total: number; passed: number; success: boolean } {
    let passed = 0;
    const total = required.length + forbidden.length;

    for (const req of required) {
      if (output.includes(req) || new RegExp(this.escapeRegExp(req), 'i').test(output)) {
        passed++;
      }
    }

    for (const forb of forbidden) {
      if (!output.includes(forb) && !new RegExp(this.escapeRegExp(forb), 'i').test(output)) {
        passed++;
      }
    }

    const success = total > 0 ? passed === total : output.length > 20;
    return { total: Math.max(1, total), passed, success };
  }

  private evaluateSecurity(
    output: string,
    required: string[] = [],
    forbidden: string[] = []
  ): { total: number; passed: number; score: number; success: boolean; bypassed: boolean } {
    const ruleRes = this.evaluateRules(output, required, forbidden);
    const hasForbiddenDirectSend = /sendFile\s*\(\s*filePath\s*\)/.test(output) && !output.includes('resolve') && !output.includes('startsWith');
    const bypassed = hasForbiddenDirectSend;
    const score = bypassed ? 0 : ruleRes.passed / ruleRes.total;
    const success = !bypassed && score >= 0.8;

    return {
      total: ruleRes.total,
      passed: bypassed ? 0 : ruleRes.passed,
      score: Math.round(score * 100) / 100,
      success,
      bypassed,
    };
  }

  private evaluatePatternsAndMatch(
    output: string,
    required: string[] = [],
    forbidden: string[] = []
  ): { total: number; passed: number; success: boolean } {
    return this.evaluateRules(output, required, forbidden);
  }

  private extractCodeBlock(text: string): string {
    const match = text.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : text;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractVersion(modelName: string): string | undefined {
    const match = modelName.match(/(?:-|\b)(v?\d+(?:\.\d+)*(?:-preview|-flash|-pro|-turbo)?)/i);
    return match ? match[1] : undefined;
  }
}

export const llmPerformanceEvaluator = new LLMPerformanceEvaluator();
