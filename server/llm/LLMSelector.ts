import { AIProviderId } from '../providers/types';
import { quotaManager } from '../quotaManager';
import { ProblemClassifier, problemClassifier as defaultClassifier } from './ProblemClassifier';
import { LLMRegistry, llmRegistry as defaultRegistry } from './LLMRegistry';
import { LLMRankingEngine, llmRankingEngine as defaultRankingEngine } from './LLMRankingEngine';
import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory } from './LLMPerformanceMemory';
import {
  ClassifiedProblem,
  LLMAdaptiveConfig,
  LLMTelemetryEvent,
  ModelRankingStats,
  ProblemCategory,
  ProblemComplexity,
  SelectionConstraints,
  SelectionDecision,
} from './types';

export const DEFAULT_ADAPTIVE_CONFIG: LLMAdaptiveConfig = {
  routingEnabled: true,
  benchmarkEnabled: true,
  benchmarkLiveEnabled: false,
  explorationRate: 0.15, // 15% exploration
  minSamplesForConfidentRank: 3,
  maxBenchmarkRequests: 50,
  maxBenchmarkCost: 2.0,
  selectionMaxCandidates: 5,
  ensembleEnabled: true,
  ensembleMinComplexity: 'HIGH',
  uncertaintyDecayFactor: 0.35,
};

/**
 * LLMSelector
 * 
 * Central decision engine executing the adaptive routing pipeline:
 * TASK -> ProblemClassifier -> LLMRegistry -> LLMRankingEngine -> Constraints / Quota / Cooldown -> LLMSelector -> Decision
 * 
 * Strict Anti-Hardcoding Invariant:
 * Never uses static model maps or category-to-model switches.
 * Decisions are strictly derived from empirical data and availability.
 */
export class LLMSelector {
  private classifier: ProblemClassifier;
  private registry: LLMRegistry;
  private rankingEngine: LLMRankingEngine;
  private memory: LLMPerformanceMemory;
  private config: LLMAdaptiveConfig;
  private telemetryListeners: Array<(e: LLMTelemetryEvent) => void> = [];

  constructor(
    classifier: ProblemClassifier = defaultClassifier,
    registry: LLMRegistry = defaultRegistry,
    rankingEngine: LLMRankingEngine = defaultRankingEngine,
    memory: LLMPerformanceMemory = defaultMemory,
    config: Partial<LLMAdaptiveConfig> = {}
  ) {
    this.classifier = classifier;
    this.registry = registry;
    this.rankingEngine = rankingEngine;
    this.memory = memory;
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
  }

  public getConfig(): LLMAdaptiveConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<LLMAdaptiveConfig>): void {
    this.config = { ...this.config, ...patch };
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
        console.warn('[LLMSelector] Telemetry listener error:', err);
      }
    }
  }

  /**
   * Main selection entrypoint given a natural language prompt or problem context
   */
  public selectModelForTask(
    taskPrompt: string,
    context?: string,
    constraints: SelectionConstraints = {}
  ): SelectionDecision {
    // 1. Classification
    const classified = this.classifier.classify(taskPrompt, context);

    this.emit({
      timestamp: new Date().toISOString(),
      event: 'LLM_CLASSIFIED',
      category: classified.category,
      details: {
        complexity: classified.complexity,
        requiredCapabilities: classified.requiredCapabilities,
        deterministicScore: classified.deterministicScore,
      },
    });

    return this.selectModelForClassifiedProblem(classified, constraints);
  }

  /**
   * Selects model from an already classified problem
   */
  public selectModelForClassifiedProblem(
    classified: ClassifiedProblem,
    constraints: SelectionConstraints = {}
  ): SelectionDecision {
    // 1. If a specific model was forced via constraints, verify availability
    if (constraints.forceModelId) {
      const entry = this.registry.getModel(constraints.forceModelId);
      if (entry && entry.availability) {
        return {
          selectedModelId: entry.modelId,
          selectedProviderId: entry.providerId,
          decisionType: 'FALLBACK',
          candidateEvaluatedCount: 1,
          reason: `Model explicitly requested via constraints: ${entry.modelId}`,
          confidence: 1.0,
          predictedScore: 0.8,
          classifiedProblem: classified,
        };
      }
    }

    // 2. Discover available candidates filtered by capabilities
    const eligible = this.registry.getEligibleCandidates(
      classified.requiredCapabilities,
      true, // allow unmeasured
      constraints.preferredProviders
    ).filter((m) => !constraints.excludeModels?.includes(m.modelId));

    if (eligible.length === 0) {
      // Fallback to any active provider default model
      const all = this.registry.discoverModels().filter((m) => m.availability);
      const fallback = all[0] || { modelId: 'mock-agent-v1', providerId: 'mock' };
      return {
        selectedModelId: fallback.modelId,
        selectedProviderId: fallback.providerId,
        decisionType: 'FALLBACK',
        candidateEvaluatedCount: 0,
        reason: 'No eligible candidates matching required capabilities and quota.',
        confidence: 0.1,
        predictedScore: 0.5,
        classifiedProblem: classified,
      };
    }

    // 3. Obtain ranking for this category and complexity
    const ranking = this.rankingEngine.getRankings(classified.category, classified.complexity);

    // 4. Decide Exploration vs Exploitation
    const shouldExplore =
      constraints.forceExploration ||
      (this.config.explorationRate > 0 && Math.random() < this.config.explorationRate);

    // Look for unmeasured or low-confidence models eligible for exploration
    const unmeasuredEligible = eligible.filter(
      (e) => e.status === 'UNMEASURED' || e.status === 'LOW_CONFIDENCE'
    );

    if (shouldExplore && unmeasuredEligible.length > 0) {
      const candidateToExplore = unmeasuredEligible[Math.floor(Math.random() * unmeasuredEligible.length)];

      this.emit({
        timestamp: new Date().toISOString(),
        event: 'LLM_EXPLORATION_STARTED',
        modelId: candidateToExplore.modelId,
        providerId: candidateToExplore.providerId,
        category: classified.category,
        details: { status: candidateToExplore.status },
      });

      return {
        selectedModelId: candidateToExplore.modelId,
        selectedProviderId: candidateToExplore.providerId,
        decisionType: 'EXPLORATION',
        candidateEvaluatedCount: eligible.length,
        reason: `Exploration policy activated: evaluating candidate ${candidateToExplore.modelId} (status: ${candidateToExplore.status})`,
        confidence: 0.25,
        predictedScore: 0.65,
        classifiedProblem: classified,
      };
    }

    // 5. Exploitation: select highest composite score among eligible candidates
    let bestModel: ModelRankingStats | null = null;
    for (const ranked of ranking.rankedModels) {
      const matchingEligible = eligible.find((e) => e.modelId === ranked.modelId && e.availability);
      if (matchingEligible) {
        bestModel = ranked;
        break;
      }
    }

    if (bestModel) {
      // Check ensemble policy for high complexity tasks
      let isEnsemble = false;
      let ensembleModels: Array<{ modelId: string; providerId: AIProviderId }> | undefined;

      if (
        this.config.ensembleEnabled &&
        (classified.complexity === 'HIGH' || classified.complexity === 'EXTREME') &&
        eligible.length >= 2
      ) {
        isEnsemble = true;
        ensembleModels = eligible.slice(0, 3).map((e) => ({ modelId: e.modelId, providerId: e.providerId }));
      }

      const decision: SelectionDecision = {
        selectedModelId: bestModel.modelId,
        selectedProviderId: bestModel.providerId,
        decisionType: 'EXPLOITATION',
        candidateEvaluatedCount: eligible.length,
        reason: `Exploitation: chosen based on empirical composite score ${bestModel.compositeRankScore} (meanScore: ${bestModel.meanScore}, samples: ${bestModel.sampleCount})`,
        confidence: bestModel.confidence,
        predictedScore: bestModel.meanScore,
        isEnsemble,
        ensembleModels,
        classifiedProblem: classified,
      };

      this.emit({
        timestamp: new Date().toISOString(),
        event: 'LLM_SELECTED',
        modelId: decision.selectedModelId,
        providerId: decision.selectedProviderId,
        category: classified.category,
        details: { decisionType: decision.decisionType, score: bestModel.compositeRankScore },
      });

      return decision;
    }

    // If no ranked models found yet (Cold Start for this category), pick eligible candidate with highest context/capabilities
    const coldStartCandidate = eligible[0];
    return {
      selectedModelId: coldStartCandidate.modelId,
      selectedProviderId: coldStartCandidate.providerId,
      decisionType: 'EXPLORATION',
      candidateEvaluatedCount: eligible.length,
      reason: `Cold start: category ${classified.category} unmeasured. Selecting eligible candidate ${coldStartCandidate.modelId} to establish baseline.`,
      confidence: 0.15,
      predictedScore: 0.6,
      classifiedProblem: classified,
    };
  }

  /**
   * Decomposes a complex task into specialized sub-tasks and selects
   * the optimal model for each phase according to category rankings.
   */
  public decomposeAndSelect(
    taskPrompt: string,
    context?: string
  ): {
    architecture: SelectionDecision;
    implementation: SelectionDecision;
    debugging: SelectionDecision;
    testing: SelectionDecision;
    review: SelectionDecision;
  } {
    return {
      architecture: this.selectModelForTask(`Design architecture for: ${taskPrompt}`, context, {
        forceExploration: false,
      }),
      implementation: this.selectModelForTask(`Implement and code: ${taskPrompt}`, context, {
        forceExploration: false,
      }),
      debugging: this.selectModelForTask(`Diagnose bugs and fix errors in: ${taskPrompt}`, context, {
        forceExploration: false,
      }),
      testing: this.selectModelForTask(`Write comprehensive unit and integration tests for: ${taskPrompt}`, context, {
        forceExploration: false,
      }),
      review: this.selectIndependentReviewer(taskPrompt, context),
    };
  }

  /**
   * Selects an independent reviewer distinct from the generator
   */
  public selectIndependentReviewer(
    taskPrompt: string,
    context?: string,
    generatorModelId?: string
  ): SelectionDecision {
    const classified = this.classifier.classify(`Security audit and architectural review for: ${taskPrompt}`, context);
    classified.category = 'SECURITY';

    return this.selectModelForClassifiedProblem(classified, {
      excludeModels: generatorModelId ? [generatorModelId] : undefined,
    });
  }
}

export const llmSelector = new LLMSelector();
