import { ProviderManager, providerManager as defaultProviderManager } from '../providerManager';
import { quotaManager } from '../quotaManager';
import { BENCHMARK_DATASET } from '../../tests/benchmarks/dataset';
import {
  BenchmarkDefinition,
  CostSource,
  ExactBenchmarkExecutionResult,
  LLMEvaluation,
  LLMTelemetryEvent,
  ProblemCategory,
} from './types';
import { LLMPerformanceEvaluator, llmPerformanceEvaluator as defaultEvaluator } from './LLMPerformanceEvaluator';
import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory } from './LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';
import { calculateModelCost } from './pricing';

export interface BenchmarkRunOptions {
  categories?: ProblemCategory[];
  benchmarkIds?: string[];
  candidateModels?: string[];
  isLive?: boolean;
  maxRequestsBudget?: number;
  maxCostBudget?: number;
}

export interface BenchmarkRunResult {
  runId: string;
  isLive: boolean;
  totalEvaluations: number;
  successfulEvaluations: number;
  evaluations: LLMEvaluation[];
  skippedDueToQuota: string[];
  skippedDueToCost: string[];
  totalCost: number;
  remainingBudget?: number;
  durationMs: number;
}

/**
 * LLMBenchmarkEngine
 * 
 * Conducts strictly controlled, paired, empirical evaluations across candidate LLMs
 * on standardized, versioned reference benchmarks.
 * 
 * Strict Scientific & Invariant Principles:
 * - ZERO Failover: Calls generateExactModelForBenchmark() with strict proof verification.
 * - Anti-Bias Failover Rejection: If failover occurs or provider/model mismatches, evaluation is invalidated immediately.
 * - Separation of Hermetic Fixtures and Live Evaluations: Clear separation with evaluationSource.
 * - Fairness: Paired execution with identical prompts, timeout, and objective sandboxed assertions.
 */
export class LLMBenchmarkEngine {
  private providerMgr: ProviderManager;
  private evaluator: LLMPerformanceEvaluator;
  private memory: LLMPerformanceMemory;
  private registry: LLMRegistry;
  private telemetryListeners: Array<(e: LLMTelemetryEvent) => void> = [];

  constructor(
    providerMgr: ProviderManager = defaultProviderManager,
    evaluator: LLMPerformanceEvaluator = defaultEvaluator,
    memory: LLMPerformanceMemory = defaultMemory,
    registry: LLMRegistry = defaultRegistry
  ) {
    this.providerMgr = providerMgr;
    this.evaluator = evaluator;
    this.memory = memory;
    this.registry = registry;
  }

  public onTelemetry(cb: (e: LLMTelemetryEvent) => void): () => void {
    this.telemetryListeners.push(cb);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter((l) => l !== cb);
    };
  }

  private emit(event: LLMTelemetryEvent): void {
    for (const l of this.telemetryListeners) {
      try {
        l(event);
      } catch (err) {
        console.warn('[LLMBenchmarkEngine] Telemetry listener error:', err);
      }
    }
  }

  /**
   * Runs standardized benchmarks across selected models under paired, identical conditions.
   */
  public async runBenchmarks(options: BenchmarkRunOptions = {}): Promise<BenchmarkRunResult> {
    const runId = `bench_run_${Date.now()}`;
    const startTime = Date.now();
    const isLive = Boolean(options.isLive);
    const maxRequests = options.maxRequestsBudget || (isLive ? 20 : 100);

    this.emit({
      timestamp: new Date().toISOString(),
      event: 'LLM_BENCHMARK_STARTED',
      taskId: runId,
      details: { isLive, options },
    });

    // 1. Select benchmarks
    let benchmarks = BENCHMARK_DATASET;
    if (options.benchmarkIds && options.benchmarkIds.length > 0) {
      benchmarks = benchmarks.filter((b) => options.benchmarkIds!.includes(b.id));
    }
    if (options.categories && options.categories.length > 0) {
      benchmarks = benchmarks.filter((b) => options.categories!.includes(b.category));
    }

    // 2. Discover models
    const allModels = this.registry.discoverModels();
    let modelsToTest = allModels.filter((m) => m.availability);

    if (options.candidateModels && options.candidateModels.length > 0) {
      modelsToTest = modelsToTest.filter((m) => options.candidateModels!.includes(m.modelId));
    }

    const evaluations: LLMEvaluation[] = [];
    const skippedDueToQuota: string[] = [];
    const skippedDueToCost: string[] = [];
    let executedRequests = 0;
    let totalCost = 0;
    const maxCostBudget = options.maxCostBudget !== undefined ? options.maxCostBudget : (isLive ? 5.0 : 100.0);

    // 3. Paired Controlled Execution:
    // For each benchmark problem, run each candidate model under identical prompt and constraints
    for (const bench of benchmarks) {
      for (const modelEntry of modelsToTest) {
        if (executedRequests >= maxRequests) {
          break;
        }

        // Check cost budget before executing request
        const estimatedNextCost = calculateModelCost(modelEntry.modelId, 500, 1000, 1500);
        if (isLive && totalCost + estimatedNextCost.cost > maxCostBudget) {
          skippedDueToCost.push(modelEntry.modelId);
          continue;
        }

        // Check quota and cooldown in live mode
        if (isLive) {
          if (quotaManager.isModelInCooldown(modelEntry.modelId)) {
            skippedDueToQuota.push(modelEntry.modelId);
            continue;
          }
          const quotaCheck = quotaManager.canUseModel(modelEntry.modelId, 'tier_3', 1000);
          if (!quotaCheck.ok) {
            skippedDueToQuota.push(modelEntry.modelId);
            continue;
          }
        }

        executedRequests++;
        const evalResult = await this.executeSingleBenchmark(
          bench,
          modelEntry.modelId,
          modelEntry.providerId,
          isLive,
          runId
        );
        evaluations.push(evalResult);

        totalCost += evalResult.estimatedCost || 0;

        // Store evaluation in memory
        this.memory.addEvaluation(evalResult);

        this.emit({
          timestamp: new Date().toISOString(),
          event: 'LLM_EVALUATED',
          taskId: runId,
          modelId: modelEntry.modelId,
          providerId: modelEntry.providerId,
          category: bench.category,
          evaluationId: evalResult.id,
          details: {
            score: evalResult.score,
            success: evalResult.success,
            source: evalResult.evaluationSource,
            cost: evalResult.estimatedCost,
            costSource: evalResult.costSource,
          },
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const successfulEvaluations = evaluations.filter((e) => e.success).length;

    this.emit({
      timestamp: new Date().toISOString(),
      event: 'LLM_BENCHMARK_COMPLETED',
      taskId: runId,
      details: {
        total: evaluations.length,
        successful: successfulEvaluations,
        totalCost,
        remainingBudget: Math.max(0, maxCostBudget - totalCost),
        durationMs,
      },
    });

    return {
      runId,
      isLive,
      totalEvaluations: evaluations.length,
      successfulEvaluations,
      evaluations,
      skippedDueToQuota,
      skippedDueToCost,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      remainingBudget: Math.max(0, Math.round((maxCostBudget - totalCost) * 1_000_000) / 1_000_000),
      durationMs,
    };
  }

  /**
   * Executes a single benchmark on an EXACT requested model and provider with Zero Failover.
   */
  public async executeSingleBenchmark(
    bench: BenchmarkDefinition,
    modelId: string,
    providerId: any,
    isLive: boolean,
    runId?: string
  ): Promise<LLMEvaluation> {
    const startTime = Date.now();
    let outputText = '';
    let costResult: { cost: number; source: CostSource } = { cost: 0, source: 'REAL_COST' };
    let proof: ExactBenchmarkExecutionResult | undefined;

    const fullPrompt = `You are solving an objective benchmark.
Problem ID: ${bench.id}
Category: ${bench.category}
Difficulty: ${bench.difficulty}

${bench.prompt}

${bench.context ? `Context:\n${bench.context}\n` : ''}
Provide a clean, precise solution adhering strictly to requirements.`;

    try {
      if (!isLive && providerId !== 'mock') {
        // Hermetic fixture evaluation (explicitly tagged as HERMETIC_FIXTURE)
        outputText = bench.criteria.referenceSolutions?.[0] || `// Hermetic benchmark fixture test\n`;
        if (bench.category === 'MATHEMATICS' && bench.criteria.expectedExactAnswer !== undefined) {
          outputText += `Result: ${bench.criteria.expectedExactAnswer}`;
        }
        costResult = { cost: 0, source: 'REAL_COST' };
      } else {
        // Live provider or Mock provider execution using ZERO FAILOVER method
        proof = await this.providerMgr.generateExactModelForBenchmark({
          providerId,
          modelId,
          prompt: fullPrompt,
          role: 'benchmark_evaluator',
          timeoutMs: 45000,
        });

        outputText = proof.text;
        costResult = calculateModelCost(
          modelId,
          proof.promptTokens,
          proof.completionTokens,
          proof.totalTokens,
          Boolean(proof.promptTokens && proof.completionTokens)
        );
      }
    } catch (err: any) {
      console.warn(`[LLMBenchmarkEngine] Model ${modelId} failed during benchmark ${bench.id}:`, err);
      outputText = '';
      costResult = calculateModelCost(modelId, 0, 0, 0);
    }

    const latencyMs = Date.now() - startTime;

    const evaluation = this.evaluator.evaluateBenchmarkOutput(
      bench,
      modelId,
      providerId,
      outputText,
      latencyMs,
      costResult.cost,
      isLive,
      proof
    );

    evaluation.costSource = costResult.source;
    if (runId) {
      evaluation.runId = runId;
    }

    return evaluation;
  }
}

export const llmBenchmarkEngine = new LLMBenchmarkEngine();
