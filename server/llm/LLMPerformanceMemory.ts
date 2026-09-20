import * as fs from 'fs';
import * as path from 'path';
import { LLMEvaluation, ModelRankingStats, ProblemCategory, ProblemComplexity, LLMStatus } from './types';

/**
 * LLMPerformanceMemory
 * 
 * Persists and indexes empirical evaluation outcomes.
 * Strictly separates different versions of the same model.
 * Computes live statistical aggregates (sample count, mean score, latency, cost, confidence).
 */
export class LLMPerformanceMemory {
  private storagePath: string;
  private evaluations: LLMEvaluation[] = [];
  private statsCache: Map<string, ModelRankingStats> = new Map();

  constructor(customStoragePath?: string) {
    this.storagePath = customStoragePath || path.resolve(process.cwd(), 'data', 'llm_performance.json');
    this.load();
  }

  /**
   * Adds an evaluation record and invalidates relevant stats caches.
   */
  public addEvaluation(evaluation: LLMEvaluation): void {
    this.evaluations.push(evaluation);
    this.recomputeStatsFor(evaluation.modelId, evaluation.category, evaluation.complexity, evaluation.modelVersion);
    this.persist();
  }

  /**
   * Batch adds evaluations (e.g. from benchmark runs)
   */
  public addEvaluations(evals: LLMEvaluation[]): void {
    for (const e of evals) {
      this.evaluations.push(e);
      this.recomputeStatsFor(e.modelId, e.category, e.complexity, e.modelVersion);
    }
    this.persist();
  }

  /**
   * Retrieves raw evaluation records with optional filters
   */
  public getEvaluations(filter?: {
    modelId?: string;
    category?: ProblemCategory;
    complexity?: ProblemComplexity;
    version?: string;
  }): LLMEvaluation[] {
    return this.evaluations.filter((e) => {
      if (filter?.modelId && e.modelId !== filter.modelId) return false;
      if (filter?.category && e.category !== filter.category) return false;
      if (filter?.complexity && e.complexity !== filter.complexity) return false;
      if (filter?.version && e.modelVersion !== filter.version) return false;
      return true;
    });
  }

  /**
   * Retrieves aggregated statistics for a specific (model, category, complexity) slice
   */
  public getStats(
    modelId: string,
    category: ProblemCategory,
    complexity?: ProblemComplexity,
    version?: string
  ): ModelRankingStats | null {
    const key = this.buildKey(modelId, category, complexity, version);
    return this.statsCache.get(key) || null;
  }

  /**
   * Returns all computed stats across all categories and models
   */
  public getAllStats(): ModelRankingStats[] {
    return Array.from(this.statsCache.values());
  }

  /**
   * Total number of evaluations recorded for a given model
   */
  public getModelEvaluationCount(modelId: string): number {
    return this.evaluations.filter((e) => e.modelId === modelId).length;
  }

  /**
   * Timestamp of last evaluation for a given model
   */
  public getModelLastEvaluatedAt(modelId: string): number | undefined {
    const list = this.evaluations.filter((e) => e.modelId === modelId);
    if (list.length === 0) return undefined;
    return Math.max(...list.map((e) => e.timestamp));
  }

  /**
   * Reset / clear performance memory (for testing and isolation)
   */
  public clear(): void {
    this.evaluations = [];
    this.statsCache.clear();
    this.persist();
  }

  private recomputeStatsFor(
    modelId: string,
    category: ProblemCategory,
    complexity?: ProblemComplexity,
    version?: string
  ): void {
    // 1. Compute specific slice (model, category, complexity, version)
    this.computeAndStore(modelId, category, complexity, version);

    // 2. Compute category-level aggregate (regardless of complexity)
    this.computeAndStore(modelId, category, undefined, version);
  }

  private computeAndStore(
    modelId: string,
    category: ProblemCategory,
    complexity?: ProblemComplexity,
    version?: string
  ): void {
    const filtered = this.evaluations.filter((e) => {
      if (e.modelId !== modelId) return false;
      if (e.category !== category) return false;
      if (complexity && e.complexity !== complexity) return false;
      if (version && e.modelVersion !== version) return false;
      return true;
    });

    const key = this.buildKey(modelId, category, complexity, version);

    if (filtered.length === 0) {
      this.statsCache.delete(key);
      return;
    }

    const sampleCount = filtered.length;
    const meanScore = filtered.reduce((acc, curr) => acc + curr.score, 0) / sampleCount;
    const successCount = filtered.filter((e) => e.success).length;
    const successRate = successCount / sampleCount;
    const meanLatencyMs = filtered.reduce((acc, curr) => acc + curr.latencyMs, 0) / sampleCount;
    const meanCost = filtered.reduce((acc, curr) => acc + (curr.estimatedCost || 0), 0) / sampleCount;
    const lastEvaluatedAt = Math.max(...filtered.map((e) => e.timestamp));
    const providerId = filtered[0].providerId;

    // Statistical Confidence Calculation:
    // Uses sample count saturation curve with variance penalty
    // N / (N + 4) provides smooth confidence growth:
    // N=1 -> 0.20, N=3 -> 0.43, N=5 -> 0.56, N=10 -> 0.71, N=20 -> 0.83
    const variance = filtered.reduce((acc, curr) => acc + Math.pow(curr.score - meanScore, 2), 0) / sampleCount;
    const baseConfidence = sampleCount / (sampleCount + 4);
    const confidence = Math.max(0.05, Math.min(1.0, baseConfidence * (1 - Math.min(0.5, variance))));

    // Uncertainty Penalty:
    // Models with few samples receive a higher uncertainty penalty on their rank score
    // to prevent 1 lucky hit (1.0 on 1 sample) from beating a proven model (0.92 on 50 samples).
    const uncertaintyPenalty = (1 - confidence) * 0.35;
    const compositeRankScore = Math.max(0, (meanScore * 0.8 + successRate * 0.2) - uncertaintyPenalty);

    let status: LLMStatus = 'UNMEASURED';
    if (sampleCount >= 4 && confidence >= 0.5) status = 'MEASURED';
    else if (sampleCount >= 1) status = 'LOW_CONFIDENCE';

    const statRecord: ModelRankingStats = {
      modelId,
      providerId,
      modelVersion: version,
      category,
      complexity,
      sampleCount,
      meanScore: Math.round(meanScore * 1000) / 1000,
      successRate: Math.round(successRate * 1000) / 1000,
      meanLatencyMs: Math.round(meanLatencyMs),
      meanCost: Math.round(meanCost * 10000) / 10000,
      confidence: Math.round(confidence * 1000) / 1000,
      uncertaintyPenalty: Math.round(uncertaintyPenalty * 1000) / 1000,
      compositeRankScore: Math.round(compositeRankScore * 1000) / 1000,
      lastEvaluatedAt,
      status,
    };

    this.statsCache.set(key, statRecord);
  }

  private buildKey(
    modelId: string,
    category: ProblemCategory,
    complexity?: ProblemComplexity,
    version?: string
  ): string {
    return `${modelId}::${version || 'any'}::${category}::${complexity || 'all'}`;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.evaluations)) {
          this.evaluations = parsed.evaluations;
          for (const e of this.evaluations) {
            this.recomputeStatsFor(e.modelId, e.category, e.complexity, e.modelVersion);
          }
        }
      }
    } catch (err) {
      console.warn('[LLMPerformanceMemory] Could not load persisted evaluations, starting fresh:', err);
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(
          {
            version: '1.0.0',
            updatedAt: Date.now(),
            totalEvaluations: this.evaluations.length,
            evaluations: this.evaluations,
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (err) {
      console.warn('[LLMPerformanceMemory] Failed to persist evaluations to disk:', err);
    }
  }
}

export const llmPerformanceMemory = new LLMPerformanceMemory();
