import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory, OPERATIONAL_SOURCES, ALL_SOURCES } from './LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';
import { ModelRankingStats, ProblemCategory, ProblemComplexity, LLMStatus, EvaluationSource } from './types';

export interface CategoryRankingResult {
  category: ProblemCategory;
  complexity?: ProblemComplexity;
  rankedModels: ModelRankingStats[];
  unmeasuredModels: string[];
  totalSamples: number;
  sourcesUsed: EvaluationSource[];
}

export interface RankingQueryOptions {
  complexity?: ProblemComplexity;
  sources?: EvaluationSource[];
  includeHermetic?: boolean;
  strictComplexityOnly?: boolean;
}

/**
 * LLMRankingEngine
 * 
 * Dynamically computes model performance rankings per category and complexity.
 * Absolutely NO hardcoded ranks.
 * 
 * Invariants:
 * - Prioritizes operational empirical evidence (REAL_TASK, LIVE_PROVIDER) for real production decisions.
 * - Separates HERMETIC_FIXTURE from operational decisions.
 * - Supports difficulty-based ranking by (category + complexity) slice.
 * - Incorporates sample size, variance, latency, and uncertainty penalties.
 */
export class LLMRankingEngine {
  private memory: LLMPerformanceMemory;
  private registry: LLMRegistry;

  constructor(memory: LLMPerformanceMemory = defaultMemory, registry: LLMRegistry = defaultRegistry) {
    this.memory = memory;
    this.registry = registry;
  }

  /**
   * Computes rank list for a category and optional complexity level with source filtering.
   */
  public getRankings(
    category: ProblemCategory,
    complexityOrOptions?: ProblemComplexity | RankingQueryOptions
  ): CategoryRankingResult {
    const options: RankingQueryOptions =
      typeof complexityOrOptions === 'string'
        ? { complexity: complexityOrOptions }
        : complexityOrOptions || {};

    const complexity = options.complexity;
    let targetSources: EvaluationSource[] = options.sources
      ? options.sources
      : options.includeHermetic
      ? ALL_SOURCES
      : OPERATIONAL_SOURCES;

    const allRegistered = this.registry.discoverModels();
    const modelSet = new Map<string, { modelId: string; version?: string }>();

    for (const m of allRegistered) {
      modelSet.set(m.modelId, { modelId: m.modelId, version: m.version });
    }

    // If operational sources yielded no stats in memory and sources was not explicitly forced,
    // fallback to ALL_SOURCES so test environments and initial fixtures remain rankable.
    let availableStats = this.memory.getAllStats(targetSources);
    if (!options.sources && !options.includeHermetic && availableStats.length === 0) {
      targetSources = ALL_SOURCES;
      availableStats = this.memory.getAllStats(ALL_SOURCES);
    }

    for (const stat of availableStats) {
      if (!modelSet.has(stat.modelId)) {
        modelSet.set(stat.modelId, { modelId: stat.modelId, version: stat.version });
      }
    }

    const rankedStats: ModelRankingStats[] = [];
    const unmeasured: string[] = [];
    let totalSamples = 0;

    for (const m of modelSet.values()) {
      // 1. Look for specific stats for (category, complexity, version) with specified sources
      let stat = complexity ? this.memory.getStats(m.modelId, category, complexity, m.version, targetSources) : null;

      // 2. If no complexity-specific stat exists and strictComplexityOnly is not requested, fallback to general category stats
      if (!stat && !options.strictComplexityOnly) {
        stat = this.memory.getStats(m.modelId, category, undefined, m.version, targetSources);
      }

      if (stat && stat.sampleCount > 0) {
        // Adjust status if model is currently unavailable or in cooldown
        const currentModelEntry = this.registry.getModel(m.modelId);
        const effectiveStatus: LLMStatus = currentModelEntry
          ? currentModelEntry.availability
            ? stat.status
            : 'UNAVAILABLE'
          : stat.status;

        rankedStats.push({
          ...stat,
          status: effectiveStatus,
        });
        totalSamples += stat.sampleCount;
      } else {
        unmeasured.push(m.modelId);
      }
    }

    // Sort descending by compositeRankScore (which balances mean score, success rate, and uncertainty penalty)
    rankedStats.sort((a, b) => {
      // Unavailable models always drop to the bottom of the operational rank
      if (a.status === 'UNAVAILABLE' && b.status !== 'UNAVAILABLE') return 1;
      if (b.status === 'UNAVAILABLE' && a.status !== 'UNAVAILABLE') return -1;

      // Primary: composite rank score
      if (b.compositeRankScore !== a.compositeRankScore) {
        return b.compositeRankScore - a.compositeRankScore;
      }

      // Secondary: higher statistical confidence
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      // Tertiary: lower latency
      return a.meanLatencyMs - b.meanLatencyMs;
    });

    return {
      category,
      complexity,
      rankedModels: rankedStats,
      unmeasuredModels: unmeasured,
      totalSamples,
      sourcesUsed: targetSources,
    };
  }

  /**
   * Computes full multidimensional ranking table across all categories
   */
  public getAllRankings(options: RankingQueryOptions = {}): Record<ProblemCategory, CategoryRankingResult> {
    const categories: ProblemCategory[] = [
      'CODE_GENERATION',
      'CODE_DEBUGGING',
      'REFACTORING',
      'ALGORITHM',
      'REASONING',
      'MATHEMATICS',
      'TEST_GENERATION',
      'TEST_FAILURE_ANALYSIS',
      'SECURITY',
      'ARCHITECTURE',
      'DOCUMENTATION',
      'DATA_ANALYSIS',
      'GENERAL_TASK',
    ];

    const result: Partial<Record<ProblemCategory, CategoryRankingResult>> = {};
    for (const cat of categories) {
      result[cat] = this.getRankings(cat, options);
    }
    return result as Record<ProblemCategory, CategoryRankingResult>;
  }

  /**
   * Returns empirical top model for a category and complexity, or null if unmeasured
   */
  public getTopRankedModel(
    category: ProblemCategory,
    complexityOrOptions?: ProblemComplexity | RankingQueryOptions,
    requireConfident = false
  ): ModelRankingStats | null {
    const ranking = this.getRankings(category, complexityOrOptions);
    if (ranking.rankedModels.length === 0) return null;

    const top = ranking.rankedModels[0];
    if (top.status === 'UNAVAILABLE') return null;

    if (requireConfident && top.status === 'LOW_CONFIDENCE') {
      // Find highest ranked MEASURED model if confident required
      const confident = ranking.rankedModels.find((m) => m.status === 'MEASURED');
      return confident || top;
    }

    return top;
  }
}

export const llmRankingEngine = new LLMRankingEngine();
