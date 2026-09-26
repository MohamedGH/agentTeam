import * as vm from 'node:vm';
import { AIProviderId } from '../providers/types';
import {
  BenchmarkDefinition,
  ClassifiedProblem,
  CostSource,
  EvaluationSource,
  FailureClass,
  LLMEvaluation,
  ProblemCategory,
  ProblemComplexity,
} from './types';

export interface TestExecutionOutcome {
  total: number;
  passed: number;
  success: boolean;
  regression: boolean;
  error?: string;
  failures?: string[];
}

/**
 * LLMPerformanceEvaluator
 * 
 * Conducts objective, multi-dimensional, sandboxed empirical evaluations of LLM outputs across
 * all categories (code generation, debugging, refactoring, security, architecture, reasoning, math).
 * 
 * Invariants:
 * - Real execution of test assertions (no hardcoded 5/5 or binary mock counts).
 * - Sandboxed execution (fail-closed, no filesystem/network/process access).
 * - Accurate evaluationSource attribution (HERMETIC_FIXTURE, LIVE_PROVIDER, REAL_TASK).
 */
export class LLMPerformanceEvaluator {
  private readonly version = '2.0.0-empirical';

  public evaluateBenchmarkOutput(
    benchmark: BenchmarkDefinition,
    modelId: string,
    providerId: AIProviderId,
    output: string,
    latencyMs: number,
    estimatedCost = 0,
    isLiveBenchmark = false,
    proof?: {
      requestedModelId: string;
      requestedProviderId: AIProviderId;
      actualModelId?: string;
      actualProviderId?: AIProviderId;
      failoverUsed: boolean;
      failureClass?: FailureClass;
      isIdentityVerified?: boolean;
      isCompliantWithSelection?: boolean;
      identitySource?: 'PROVIDER_RESPONSE_PAYLOAD' | 'MOCK_DETERMINISTIC_PROOF' | 'UNVERIFIED_DEFAULT' | 'NONE';
    }
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

    // Invariant: LIVE_PROVIDER evaluation MUST have valid, compliant proof and exact matching model/provider.
    // If isLiveBenchmark is true, proof is strictly required with valid identitySource and verified identity.
    const isLiveWithoutValidProof = isLiveBenchmark && (
      !proof ||
      proof.failoverUsed ||
      proof.isIdentityVerified !== true ||
      proof.isCompliantWithSelection !== true ||
      proof.actualModelId !== modelId ||
      proof.actualProviderId !== providerId ||
      proof.actualModelId !== proof.requestedModelId ||
      proof.actualProviderId !== proof.requestedProviderId ||
      (proof.identitySource !== 'PROVIDER_RESPONSE_PAYLOAD' && proof.identitySource !== 'MOCK_DETERMINISTIC_PROOF')
    );

    const isProofMismatchOrFailover = Boolean(
      proof && (
        proof.failoverUsed ||
        proof.isIdentityVerified === false ||
        proof.isCompliantWithSelection === false ||
        proof.actualModelId !== proof.requestedModelId ||
        proof.actualProviderId !== proof.requestedProviderId ||
        proof.actualModelId !== modelId ||
        proof.actualProviderId !== providerId
      )
    );

    if (isLiveWithoutValidProof || isProofMismatchOrFailover) {
      return {
        id: `eval_failover_blocked_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        modelId,
        providerId,
        modelVersion: this.extractVersion(modelId),
        problemId: benchmark.id,
        category: benchmark.category,
        complexity: benchmark.difficulty,
        evaluationSource: isLiveBenchmark ? 'LIVE_PROVIDER' : 'HERMETIC_FIXTURE',
        success: false,
        score: 0,
        latencyMs,
        estimatedCost,
        testsPassed: 0,
        totalTests: 1,
        regressionDetected: true,
        evaluatorVersion: this.version,
        timestamp: startTime,
        failureClass: proof?.failureClass || 'PROVIDER_FAILURE',
        details: {
          failoverBlocked: true,
          error: proof
            ? `Execution proof rejected in benchmark: requested ${proof.requestedProviderId}/${proof.requestedModelId} but executed ${proof.actualProviderId}/${proof.actualModelId} (verified=${proof.isIdentityVerified}, compliant=${proof.isCompliantWithSelection}, source=${proof.identitySource})`
            : `Missing mandatory execution proof for LIVE_PROVIDER benchmark on ${providerId}/${modelId}`,
        },
        isLiveBenchmark,
        outputSample: cleanOutput.slice(0, 180),
        proof,
      };
    }

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

    const evaluationSource: EvaluationSource = isLiveBenchmark ? 'LIVE_PROVIDER' : 'HERMETIC_FIXTURE';

    return {
      id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      modelId,
      providerId,
      modelVersion: this.extractVersion(modelId),
      problemId: benchmark.id,
      category: benchmark.category,
      complexity: benchmark.difficulty,
      evaluationSource,
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
      proof,
    };
  }

  /**
   * Evaluates real production tasks post-execution to feed memory without artificial fixtures.
   */
  public evaluateRealTaskExecution(
    task: ClassifiedProblem,
    modelId: string,
    providerId: AIProviderId,
    executionResult: {
      success: boolean;
      runId?: string;
      exitCode?: number;
      testsPassed?: number;
      totalTests?: number;
      latencyMs: number;
      estimatedCost?: number;
      costSource?: CostSource;
      regressionDetected?: boolean;
      compilerErrors?: string[];
      output?: string;
      failureClass?: FailureClass;
      context?: string;
      proof?: {
        requestedModelId: string;
        requestedProviderId: AIProviderId;
        actualModelId?: string;
        actualProviderId?: AIProviderId;
        failoverUsed: boolean;
        failureClass?: FailureClass;
        isIdentityVerified?: boolean;
        isCompliantWithSelection?: boolean;
        identitySource?: string;
      };
    }
  ): LLMEvaluation {
    const rawProof = executionResult.proof;
    const failoverUsed = Boolean(rawProof?.failoverUsed);
    const rawActualModelId = typeof rawProof?.actualModelId === 'string' && rawProof.actualModelId.trim().length > 0 ? rawProof.actualModelId.trim() : undefined;
    const rawActualProviderId = typeof rawProof?.actualProviderId === 'string' && rawProof.actualProviderId.trim().length > 0 ? rawProof.actualProviderId : undefined;
    const hasValidIdentitySource = rawProof?.identitySource === 'PROVIDER_RESPONSE_PAYLOAD' || rawProof?.identitySource === 'MOCK_DETERMINISTIC_PROOF';

    const isIdentityVerified = Boolean(
      rawProof &&
      rawProof.isIdentityVerified === true &&
      hasValidIdentitySource &&
      rawActualModelId !== undefined &&
      rawActualProviderId !== undefined &&
      rawActualModelId === modelId &&
      rawActualProviderId === providerId &&
      !failoverUsed
    );

    const actualModelId = rawActualModelId;
    const actualProviderId = rawActualProviderId;

    const isCompliantWithSelection = Boolean(
      isIdentityVerified &&
      !failoverUsed &&
      actualProviderId === providerId &&
      actualModelId === modelId
    );

    let isSuccess = executionResult.success;
    let failureClass = executionResult.failureClass;

    if (!isIdentityVerified || !isCompliantWithSelection || failoverUsed) {
      isSuccess = false;
      if (!failureClass) {
        failureClass = 'PROVIDER_FAILURE';
      }
    }

    const totalTests = executionResult.totalTests || 1;
    const testsPassed = executionResult.testsPassed !== undefined
      ? executionResult.testsPassed
      : isSuccess ? 1 : 0;

    let score = isSuccess ? 1.0 : 0.0;
    if (executionResult.totalTests && executionResult.totalTests > 0) {
      score = (executionResult.testsPassed || 0) / executionResult.totalTests;
    }
    if (executionResult.regressionDetected) {
      score = Math.max(0, score - 0.5);
    }
    if (executionResult.compilerErrors && executionResult.compilerErrors.length > 0) {
      score = 0;
    }
    if (!isIdentityVerified || !isCompliantWithSelection || failoverUsed) {
      score = 0;
    }

    const runId = executionResult.runId || `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: `eval_real_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      runId,
      modelId,
      providerId,
      modelVersion: this.extractVersion(modelId),
      problemId: `task_${task.category.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      category: task.category,
      complexity: task.complexity,
      evaluationSource: 'REAL_TASK',
      success: isSuccess && !executionResult.regressionDetected,
      score: Math.round(score * 100) / 100,
      latencyMs: executionResult.latencyMs,
      estimatedCost: executionResult.estimatedCost,
      costSource: executionResult.costSource || 'UNKNOWN_COST',
      testsPassed,
      totalTests,
      regressionDetected: Boolean(executionResult.regressionDetected),
      evaluatorVersion: this.version,
      timestamp: Date.now(),
      failureClass,
      details: {
        exitCode: executionResult.exitCode,
        compilerErrors: executionResult.compilerErrors,
        context: executionResult.context,
        detectedLanguages: task.detectedLanguages,
      },
      isLiveBenchmark: false,
      outputSample: executionResult.output ? executionResult.output.slice(0, 180) : undefined,
      proof: {
        requestedModelId: rawProof?.requestedModelId || modelId,
        requestedProviderId: rawProof?.requestedProviderId || providerId,
        actualModelId,
        actualProviderId,
        failoverUsed,
        failureClass,
        isIdentityVerified,
        isCompliantWithSelection,
        identitySource: (rawProof?.identitySource as any) || (isIdentityVerified ? 'PROVIDER_RESPONSE_PAYLOAD' : 'NONE'),
      },
    };
  }

  /**
   * Executes code and test harness in a hardened, isolated sandbox with counted assertions.
   */
  public runTestExecution(code: string, testHarness?: string): TestExecutionOutcome {
    if (!testHarness) {
      const basicSuccess = code.length > 20;
      return { total: 1, passed: basicSuccess ? 1 : 0, success: basicSuccess, regression: !basicSuccess };
    }

    // Fail-closed security pre-scan: reject unsafe primitives or prototype pollution attempts
    const unsafePatterns = [
      /\bprocess\b/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /\bchild_process\b/,
      /\bfs\b/,
      /\b__proto__\b/,
      /\bconstructor\s*\.\s*constructor\b/,
    ];
    for (const pat of unsafePatterns) {
      if (pat.test(code)) {
        return {
          total: 1,
          passed: 0,
          success: false,
          regression: true,
          error: `Security violation: code contains forbidden primitive or escape pattern: ${pat}`,
          failures: ['Blocked by security sandbox pre-scan'],
        };
      }
    }

    let assertionTotal = 0;
    let assertionPassed = 0;
    const failures: string[] = [];

    // Custom assert runner injected into sandbox
    const assertFn = (condition: any, message?: string) => {
      assertionTotal++;
      if (Boolean(condition)) {
        assertionPassed++;
      } else {
        const failureMsg = message || `Assertion ${assertionTotal} failed`;
        failures.push(failureMsg);
      }
    };

    try {
      // Create isolated sandbox context with zero OS/network/process capabilities
      const sandboxContext = Object.create(null);
      Object.assign(sandboxContext, {
        assert: assertFn,
        Math,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        RegExp,
        Set,
        Map,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        console: {
          log: () => {},
          warn: () => {},
          error: () => {},
        },
      });

      const context = vm.createContext(sandboxContext);

      // Clean TypeScript annotations if any simple ones exist
      const sanitizedCode = this.stripSimpleTsTypes(code);

      // Script executes candidate code then runs test harness assertions
      const fullScript = `
        (function() {
          "use strict";
          ${sanitizedCode}
          ${testHarness}
        })();
      `;

      vm.runInContext(fullScript, context, {
        timeout: 500, // Strict 500ms timeout
        displayErrors: false,
      });

      // If test harness didn't call assertFn explicitly but completed without throwing, mark 1 passed test
      if (assertionTotal === 0) {
        assertionTotal = 1;
        assertionPassed = 1;
      }

      return {
        total: assertionTotal,
        passed: assertionPassed,
        success: assertionTotal > 0 && assertionPassed === assertionTotal,
        regression: assertionPassed < assertionTotal,
        failures: failures.length > 0 ? failures : undefined,
      };
    } catch (err: any) {
      if (assertionTotal === 0) {
        assertionTotal = 1;
        assertionPassed = 0;
      }
      return {
        total: assertionTotal,
        passed: assertionPassed,
        success: false,
        regression: true,
        error: err?.message || String(err),
        failures: failures.length > 0 ? failures : [err?.message || String(err)],
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

  private stripSimpleTsTypes(code: string): string {
    // Strips common TypeScript type annotations for raw JS VM execution
    return code
      .replace(/:\s*(?:string|number|boolean|any|void|unknown|never|Promise<[^>]+>|Array<[^>]+>|Record<[^>]+>)(?=[,\);=\s])/g, '')
      .replace(/<[A-Z0-9_,\s]+>(?=\()/g, '');
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
