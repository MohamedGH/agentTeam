import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory } from './LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';
import { LLMRankingEngine, llmRankingEngine as defaultRanking } from './LLMRankingEngine';
import { ProblemCategory, ModelRankingStats } from './types';

export interface LLMHealthObservation {
  totalEvaluations: number;
  unmeasuredModelsCount: number;
  underperformingModels: Array<{
    modelId: string;
    category: ProblemCategory;
    successRate: number;
    meanScore: number;
    meanLatencyMs: number;
    sampleCount: number;
    issue: 'LOW_SUCCESS_RATE' | 'EXCESSIVE_LATENCY' | 'ELEVATED_REGRESSION';
  }>;
  unexploredPromisingModels: string[];
  anomaliesDetected: boolean;
  recommendations: string[];
}

/**
 * LLMSelfImprovementAdapter
 * 
 * Bridges LLM empirical routing memory with the autonomous SelfImprovementEngine.
 * Identifies sub-optimal LLM choices, abnormal failure spikes, regression bursts,
 * and high-potential unmeasured models.
 */
export class LLMSelfImprovementAdapter {
  private memory: LLMPerformanceMemory;
  private registry: LLMRegistry;
  private rankingEngine: LLMRankingEngine;

  constructor(
    memory: LLMPerformanceMemory = defaultMemory,
    registry: LLMRegistry = defaultRegistry,
    rankingEngine: LLMRankingEngine = defaultRanking
  ) {
    this.memory = memory;
    this.registry = registry;
    this.rankingEngine = rankingEngine;
  }

  /**
   * Generates a health assessment of LLM routing and performance
   */
  public inspectLLMPerformance(): LLMHealthObservation {
    const stats = this.memory.getAllStats();
    const allModels = this.registry.discoverModels();
    const evaluations = this.memory.getEvaluations();

    const underperforming: LLMHealthObservation['underperformingModels'] = [];
    const recommendations: string[] = [];

    // Analyze each model performance slice
    for (const s of stats) {
      if (s.sampleCount >= 2) {
        if (s.successRate < 0.5) {
          underperforming.push({
            modelId: s.modelId,
            category: s.category,
            successRate: s.successRate,
            meanScore: s.meanScore,
            meanLatencyMs: s.meanLatencyMs,
            sampleCount: s.sampleCount,
            issue: 'LOW_SUCCESS_RATE',
          });
          recommendations.push(
            `Model ${s.modelId} has abnormal failure rate (${Math.round((1 - s.successRate) * 100)}%) on ${s.category}. Lowering routing priority.`
          );
        } else if (s.meanLatencyMs > 25000) {
          underperforming.push({
            modelId: s.modelId,
            category: s.category,
            successRate: s.successRate,
            meanScore: s.meanScore,
            meanLatencyMs: s.meanLatencyMs,
            sampleCount: s.sampleCount,
            issue: 'EXCESSIVE_LATENCY',
          });
          recommendations.push(
            `Model ${s.modelId} exhibits excessive latency (${s.meanLatencyMs}ms) on ${s.category}. Recommending alternative candidate.`
          );
        }
      }
    }

    // Check for unmeasured models that are configured and available
    const unmeasuredAvailable = allModels.filter((m) => m.availability && m.status === 'UNMEASURED');
    const unexploredPromisingModels = unmeasuredAvailable.map((m) => m.modelId);

    if (unexploredPromisingModels.length > 0) {
      recommendations.push(
        `Discovered ${unexploredPromisingModels.length} unmeasured models (${unexploredPromisingModels.join(', ')}). Scheduled for controlled exploration.`
      );
    }

    return {
      totalEvaluations: evaluations.length,
      unmeasuredModelsCount: unmeasuredAvailable.length,
      underperformingModels: underperforming,
      unexploredPromisingModels,
      anomaliesDetected: underperforming.length > 0,
      recommendations,
    };
  }
}

export const llmSelfImprovementAdapter = new LLMSelfImprovementAdapter();
