import { AIProviderId } from '../providers/types';
import { quotaManager } from '../quotaManager';
import { calculateModelCost } from './pricing';
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
  RandomProvider,
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
 * Central decision engine executing the empirical adaptive routing pipeline:
 * TASK -> ProblemClassifier -> LLMRegistry -> LLMRankingEngine -> Constraints / Quota / Cooldown -> LLMSelector -> Decision
 * 
 * Invariants:
 * - Anti-Hardcoding: Never uses static model mappings or hardcoded switches.
 * - Fair Cold Start: In unmeasured categories, applies fair exploration (round-robin / least-explored) instead of biased eligible[0].
 * - Testable Exploration: Injects RandomProvider for 100% deterministic test coverage.
 * - Telemetry Logging: Explicitly records COLD_START_EXPLORATION events.
 */
export class LLMSelector {
  private classifier: ProblemClassifier;
  private registry: LLMRegistry;
  private rankingEngine: LLMRankingEngine;
  private memory: LLMPerformanceMemory;
  private config: LLMAdaptiveConfig;
  private explorationCounts: Map<string, number> = new Map();
  private defaultRandomProvider: RandomProvider = { next: () => Math.random() };
  private telemetryListeners: Array<(e: LLMTelemetryEvent) => void> = [];

  constructor(
    classifier: ProblemClassifier = defaultClassifier,
    registry: LLMRegistry = defaultRegistry,
    rankingEngine: LLMRankingEngine = defaultRankingEngine,
    memory: LLMPerformanceMemory = defaultMemory,
    config: Partial<LLMAdaptiveConfig> = {},
    randomProvider?: RandomProvider
  ) {
    this.classifier = classifier;
    this.registry = registry;
    this.rankingEngine = rankingEngine;
    this.memory = memory;
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    if (randomProvider) {
      this.defaultRandomProvider = randomProvider;
    }
  }

  public getConfig(): LLMAdaptiveConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<LLMAdaptiveConfig>): void {
    this.config = { ...this.config, ...patch };
    if (patch.uncertaintyDecayFactor !== undefined) {
      this.memory.setUncertaintyDecayFactor(patch.uncertaintyDecayFactor);
    }
  }

  public setRandomProvider(provider: RandomProvider): void {
    this.defaultRandomProvider = provider;
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
    const random = constraints.randomProvider || this.defaultRandomProvider;

    // 1. If a specific model was forced via constraints, verify availability
    if (constraints.forceModelId) {
      const entry = this.registry.getModel(constraints.forceModelId);
      if (entry && entry.availability) {
        // Look up empirical statistics for this model in memory
        const stats =
          this.memory.getStats(
            entry.modelId,
            classified.category,
            classified.complexity,
            entry.version,
            ['LIVE_PROVIDER', 'REAL_TASK']
          ) ||
          this.memory.getStats(
            entry.modelId,
            classified.category,
            undefined,
            entry.version,
            ['LIVE_PROVIDER', 'REAL_TASK']
          );

        const confidence = stats ? stats.confidence : 0.1;
        const predictedScore = stats ? stats.meanScore : 0.5;

        return {
          selectedModelId: entry.modelId,
          selectedProviderId: entry.providerId,
          decisionType: 'MANUAL_OVERRIDE',
          candidateEvaluatedCount: 1,
          reason: `Model explicitly requested via manual override: ${entry.modelId}${
            stats
              ? ` (empirical score: ${stats.meanScore}, confidence: ${stats.confidence})`
              : ' (no empirical data)'
          }`,
          confidence,
          predictedScore,
          classifiedProblem: classified,
        };
      }
    }

    // 2. Discover available candidates filtered strictly by capabilities
    let eligible = this.registry.getEligibleCandidates(
      classified.requiredCapabilities,
      true, // allow unmeasured
      constraints.preferredProviders
    ).filter((m) => !constraints.excludeModels?.includes(m.modelId));

    // Filter by quota and cooldown status
    eligible = eligible.filter((m) => {
      if (quotaManager.isModelInCooldown(m.modelId)) return false;
      const quotaCheck = quotaManager.canUseModel(m.modelId, 'tier_3', classified.estimatedTokens || 1000);
      return quotaCheck.ok;
    });

    // Enforce hard constraints: maxLatencyMs and maxCost
    if (constraints.maxLatencyMs !== undefined || constraints.maxCost !== undefined) {
      const constraintEligible = eligible.filter((m) => {
        const stats =
          this.memory.getStats(m.modelId, classified.category, classified.complexity, m.version, [
            'LIVE_PROVIDER',
            'REAL_TASK',
          ]) ||
          this.memory.getStats(m.modelId, classified.category, undefined, m.version, [
            'LIVE_PROVIDER',
            'REAL_TASK',
          ]);

        // 1. HARD LATENCY CONSTRAINT
        if (constraints.maxLatencyMs !== undefined) {
          if (stats && stats.sampleCount > 0) {
            if (stats.meanLatencyMs > constraints.maxLatencyMs) {
              return false;
            }
          } else {
            // Model has no empirical latency stats.
            // Under hard constraints, unknown latency is unsafe unless explicitly allowed.
            if (!constraints.allowUnmeasuredUnderConstraints) {
              return false;
            }
          }
        }

        // 2. HARD COST CONSTRAINT
        if (constraints.maxCost !== undefined) {
          const estTokens = classified.estimatedTokens || 2000;
          const pTokens = Math.round(estTokens * 0.4);
          const cTokens = Math.round(estTokens * 0.6);
          const pricing = calculateModelCost(m.modelId, pTokens, cTokens, estTokens, false);

          // Unknown cost cannot be assumed safe under a hard budget constraint
          if (pricing.source === 'UNKNOWN_COST' && (!stats || stats.sampleCount === 0)) {
            return false;
          }

          // Known pricing exceeds hard budget
          if (pricing.source !== 'UNKNOWN_COST' && pricing.cost > constraints.maxCost) {
            return false;
          }

          // Empirical historical cost exceeds hard budget
          if (stats && stats.sampleCount > 0 && stats.meanCost > constraints.maxCost) {
            return false;
          }
        }

        return true;
      });

      if (constraintEligible.length === 0) {
        // HARD CONSTRAINT: Never select a violating candidate!
        return {
          selectedModelId: '',
          selectedProviderId: (constraints.preferredProviders?.[0] || 'mock') as AIProviderId,
          decisionType: 'NO_FEASIBLE_MODEL',
          candidateEvaluatedCount: eligible.length,
          reason: `All candidate models violated hard constraints (maxLatencyMs: ${constraints.maxLatencyMs}, maxCost: ${constraints.maxCost}). No candidate satisfies constraints.`,
          confidence: 0,
          predictedScore: 0,
          classifiedProblem: classified,
        };
      }

      eligible = constraintEligible;
    }

    if (eligible.length === 0) {
      // Fallback to any active provider default model
      const all = this.registry
        .discoverModels()
        .filter((m) => m.availability && !quotaManager.isModelInCooldown(m.modelId));
      const fallback = all[0] || { modelId: 'mock-agent-v1', providerId: 'mock' };
      return {
        selectedModelId: fallback.modelId,
        selectedProviderId: fallback.providerId as any,
        decisionType: 'FALLBACK',
        candidateEvaluatedCount: 0,
        reason: 'No eligible candidates matching required capabilities and quota/cooldown status.',
        confidence: 0.1,
        predictedScore: 0.5,
        classifiedProblem: classified,
      };
    }

    // 3. Obtain ranking for this category and complexity (preferring operational data)
    const ranking = this.rankingEngine.getRankings(classified.category, classified.complexity);

    // 4. Decide Exploration vs Exploitation
    const randomVal = random.next();
    const shouldExplore =
      constraints.forceExploration ||
      (this.config.explorationRate > 0 && randomVal < this.config.explorationRate);

    // Look for unmeasured or low-confidence models eligible for exploration
    const unmeasuredEligible = eligible.filter(
      (e) => e.status === 'UNMEASURED' || e.status === 'LOW_CONFIDENCE'
    );

    if (shouldExplore && unmeasuredEligible.length > 0) {
      // Pick candidate with lowest exploration count (fair exploration)
      const sortedByExploration = [...unmeasuredEligible].sort((a, b) => {
        const countA = this.explorationCounts.get(`${a.modelId}::${classified.category}`) || 0;
        const countB = this.explorationCounts.get(`${b.modelId}::${classified.category}`) || 0;
        return countA - countB;
      });

      // Filter candidates tied for lowest count and pick uniformly via randomProvider
      const minCount = this.explorationCounts.get(`${sortedByExploration[0].modelId}::${classified.category}`) || 0;
      const candidatesWithMin = sortedByExploration.filter(
        (c) => (this.explorationCounts.get(`${c.modelId}::${classified.category}`) || 0) === minCount
      );
      const chosenIndex = Math.floor(random.next() * candidatesWithMin.length);
      const candidateToExplore = candidatesWithMin[chosenIndex] || candidatesWithMin[0];

      // Track exploration count
      const key = `${candidateToExplore.modelId}::${classified.category}`;
      this.explorationCounts.set(key, (this.explorationCounts.get(key) || 0) + 1);

      const isColdCategory = ranking.rankedModels.length === 0;
      const explorationReason = isColdCategory ? 'COLD_START_EXPLORATION' : 'DYNAMIC_EXPLORATION';

      this.emit({
        timestamp: new Date().toISOString(),
        event: 'LLM_EXPLORATION_STARTED',
        modelId: candidateToExplore.modelId,
        providerId: candidateToExplore.providerId,
        category: classified.category,
        details: { status: candidateToExplore.status, reason: explorationReason, explorationCount: minCount + 1 },
      });

      return {
        selectedModelId: candidateToExplore.modelId,
        selectedProviderId: candidateToExplore.providerId,
        decisionType: 'EXPLORATION',
        candidateEvaluatedCount: eligible.length,
        reason: `Exploration policy activated: evaluating candidate ${candidateToExplore.modelId} (status: ${candidateToExplore.status}, explorations: ${minCount + 1})`,
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
        const candidates: Array<{ modelId: string; providerId: AIProviderId }> = [];
        // 1. Add top ranked eligible models
        for (const ranked of ranking.rankedModels) {
          const match = eligible.find((e) => e.modelId === ranked.modelId);
          if (match && !candidates.some((c) => c.modelId === match.modelId)) {
            candidates.push({ modelId: match.modelId, providerId: match.providerId });
            if (candidates.length >= 3) break;
          }
        }
        // 2. If fewer than 2 candidates, fill from remaining eligible models
        if (candidates.length < 2) {
          for (const e of eligible) {
            if (!candidates.some((c) => c.modelId === e.modelId)) {
              candidates.push({ modelId: e.modelId, providerId: e.providerId });
              if (candidates.length >= 3) break;
            }
          }
        }
        ensembleModels = candidates;
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

    // 6. Cold Start Handling (No empirical data exists yet for this category)
    // Avoid default eligible[0] bias: use balanced round-robin / least-explored candidate selection
    const sortedColdStart = [...eligible].sort((a, b) => {
      const countA = this.explorationCounts.get(`${a.modelId}::${classified.category}`) || 0;
      const countB = this.explorationCounts.get(`${b.modelId}::${classified.category}`) || 0;
      return countA - countB;
    });

    const lowestExplorationCount = this.explorationCounts.get(`${sortedColdStart[0].modelId}::${classified.category}`) || 0;
    const leastExploredCandidates = sortedColdStart.filter(
      (c) => (this.explorationCounts.get(`${c.modelId}::${classified.category}`) || 0) === lowestExplorationCount
    );

    const coldIndex = Math.floor(random.next() * leastExploredCandidates.length);
    const coldStartCandidate = leastExploredCandidates[coldIndex] || leastExploredCandidates[0];

    const coldKey = `${coldStartCandidate.modelId}::${classified.category}`;
    const newCount = (this.explorationCounts.get(coldKey) || 0) + 1;
    this.explorationCounts.set(coldKey, newCount);

    this.emit({
      timestamp: new Date().toISOString(),
      event: 'LLM_EXPLORATION_STARTED',
      modelId: coldStartCandidate.modelId,
      providerId: coldStartCandidate.providerId,
      category: classified.category,
      details: { reason: 'COLD_START_EXPLORATION', modelId: coldStartCandidate.modelId, explorationCount: newCount },
    });

    return {
      selectedModelId: coldStartCandidate.modelId,
      selectedProviderId: coldStartCandidate.providerId,
      decisionType: 'EXPLORATION',
      candidateEvaluatedCount: eligible.length,
      reason: `Cold start exploration: category ${classified.category} unmeasured. Selected least-explored candidate ${coldStartCandidate.modelId} (round ${newCount}) to establish baseline.`,
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
