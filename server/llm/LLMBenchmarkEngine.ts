import { ProviderManager, providerManager as defaultProviderManager } from '../providerManager';
import { quotaManager } from '../quotaManager';
import { BENCHMARK_DATASET } from '../../tests/benchmarks/dataset';
import {
  BenchmarkDefinition,
  LLMAdaptiveConfig,
  LLMEvaluation,
  LLMTelemetryEvent,
  ProblemCategory,
} from './types';
import { LLMPerformanceEvaluator, llmPerformanceEvaluator as defaultEvaluator } from './LLMPerformanceEvaluator';
import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory } from './LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';

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
  durationMs: number;
}

/**
 * LLMBenchmarkEngine
 * 
 * Conducts strictly controlled, paired evaluations across candidate LLMs
 * on standardized, versioned reference benchmarks.
 * Employs identical prompts, identical constraints, and identical objective assertions.
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
   * Runs standardized benchmarks across selected models.
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
    let executedRequests = 0;

    // 3. Controlled execution: for each benchmark, compare each candidate under identical conditions
    for (const bench of benchmarks) {
      for (const modelEntry of modelsToTest) {
        if (executedRequests >= maxRequests) {
          break;
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
        const evalResult = await this.executeSingleBenchmark(bench, modelEntry.modelId, modelEntry.providerId, isLive);
        evaluations.push(evalResult);

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
          details: { score: evalResult.score, success: evalResult.success },
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
      durationMs,
    };
  }

  /**
   * Executes a single benchmark on a specific model under controlled conditions
   */
  public async executeSingleBenchmark(
    bench: BenchmarkDefinition,
    modelId: string,
    providerId: any,
    isLive: boolean
  ): Promise<LLMEvaluation> {
    const startTime = Date.now();
    let outputText = '';
    let estimatedCost = 0;

    try {
      const fullPrompt = `You are solving an objective benchmark.
Problem ID: ${bench.id}
Category: ${bench.category}
Difficulty: ${bench.difficulty}

${bench.prompt}

${bench.context ? `Context:\n${bench.context}\n` : ''}
Provide a clean, precise solution adhering strictly to requirements.`;

      if (!isLive && providerId !== 'mock') {
        // Hermetic mock simulation for non-live benchmark execution
        outputText = `// Hermetic benchmark response for ${modelId}\n// Method: ${bench.criteria.method}\n// Solution\n`;
        if (bench.category === 'MATHEMATICS' && bench.criteria.expectedExactAnswer) {
          outputText += `Result: ${bench.criteria.expectedExactAnswer}`;
        } else if (bench.category === 'CODE_DEBUGGING') {
          outputText += `function solution() { return true; }`;
        }
        estimatedCost = 0;
      } else {
        const genResult = await this.providerMgr.generateWithUsage(
          modelId,
          fullPrompt,
          `// Fallback benchmark response for ${modelId}\n// Method: ${bench.criteria.method}`,
          'benchmark_evaluator',
          providerId
        );

        outputText = genResult.text;
        const tokens = genResult.totalTokens || 250;
        estimatedCost = this.estimateCost(modelId, tokens);
      }
    } catch (err) {
      console.warn(`[LLMBenchmarkEngine] Model ${modelId} failed during benchmark ${bench.id}:`, err);
      outputText = '';
    }

    const latencyMs = Date.now() - startTime;

    return this.evaluator.evaluateBenchmarkOutput(
      bench,
      modelId,
      providerId,
      outputText,
      latencyMs,
      estimatedCost,
      isLive
    );
  }

  private estimateCost(modelId: string, totalTokens: number): number {
    // Standard approximate pricing per 1K tokens
    if (modelId.includes('ultra') || modelId.includes('opus')) return (totalTokens / 1000) * 0.015;
    if (modelId.includes('pro') || modelId.includes('gpt-4') || modelId.includes('sonnet')) return (totalTokens / 1000) * 0.003;
    return (totalTokens / 1000) * 0.00015; // flash/mini/mock
  }
}

export const llmBenchmarkEngine = new LLMBenchmarkEngine();
