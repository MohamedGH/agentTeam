import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory } from './LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';
import { ModelRankingStats, ProblemCategory, ProblemComplexity, LLMStatus } from './types';

export interface CategoryRankingResult {
  category: ProblemCategory;
  complexity?: ProblemComplexity;
  rankedModels: ModelRankingStats[];
  unmeasuredModels: string[];
  totalSamples: number;
}

/**
 * LLMRankingEngine
 * 
 * Dynamically computes model performance rankings per category and complexity.
 * Absolutely NO hardcoded ranks.
 * Incorporates sample size, variance, latency, and uncertainty penalties.
 */
export class LLMRankingEngine {
  private memory: LLMPerformanceMemory;
  private registry: LLMRegistry;

  constructor(memory: LLMPerformanceMemory = defaultMemory, registry: LLMRegistry = defaultRegistry) {
    this.memory = memory;
    this.registry = registry;
  }

  /**
   * Computes rank list for a category and optional complexity level
   */
  public getRankings(category: ProblemCategory, complexity?: ProblemComplexity): CategoryRankingResult {
    const allRegistered = this.registry.discoverModels();
    const modelSet = new Map<string, { modelId: string; version?: string }>();

    for (const m of allRegistered) {
      modelSet.set(m.modelId, { modelId: m.modelId, version: m.version });
    }

    for (const stat of this.memory.getAllStats()) {
      if (!modelSet.has(stat.modelId)) {
        modelSet.set(stat.modelId, { modelId: stat.modelId, version: stat.version });
      }
    }

    const rankedStats: ModelRankingStats[] = [];
    const unmeasured: string[] = [];
    let totalSamples = 0;

    for (const m of modelSet.values()) {
      // Look for specific stats with complexity if requested
      let stat = complexity ? this.memory.getStats(m.modelId, category, complexity, m.version) : null;

      // Fallback to general category stats if complexity-specific stats don't exist yet
      if (!stat) {
        stat = this.memory.getStats(m.modelId, category, undefined, m.version);
      }

      if (stat && stat.sampleCount > 0) {
        // Adjust status if model is currently unavailable or in cooldown
        const currentModelEntry = this.registry.getModel(m.modelId);
        const effectiveStatus: LLMStatus = currentModelEntry ? (currentModelEntry.availability ? stat.status : 'UNAVAILABLE') : stat.status;

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

      // Secondary: higher confidence
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
    };
  }

  /**
   * Computes full multidimensional ranking table across all categories
   */
  public getAllRankings(): Record<ProblemCategory, CategoryRankingResult> {
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
      result[cat] = this.getRankings(cat);
    }
    return result as Record<ProblemCategory, CategoryRankingResult>;
  }

  /**
   * Returns empirical top model for a category and complexity, or null if unmeasured
   */
  public getTopRankedModel(
    category: ProblemCategory,
    complexity?: ProblemComplexity,
    requireConfident = false
  ): ModelRankingStats | null {
    const ranking = this.getRankings(category, complexity);
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
