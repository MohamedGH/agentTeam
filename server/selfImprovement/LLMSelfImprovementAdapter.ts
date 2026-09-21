import { LLMPerformanceMemory, llmPerformanceMemory as defaultMemory, OPERATIONAL_SOURCES } from '../llm/LLMPerformanceMemory';
import { LLMRegistry, llmRegistry as defaultRegistry } from '../llm/LLMRegistry';
import { LLMSelector, llmSelector as defaultSelector } from '../llm/LLMSelector';
import { LLMBenchmarkEngine, llmBenchmarkEngine as defaultBenchmarkEngine } from '../llm/LLMBenchmarkEngine';
import { quotaManager } from '../quotaManager';
import { ProblemCategory } from '../llm/types';

export type LLMAnomalyType =
  | 'SUSTAINED_LOW_SUCCESS'
  | 'HIGH_REGRESSION_RATE'
  | 'EXCESSIVE_LATENCY'
  | 'UNEXPLORED_AVAILABLE_MODEL'
  | 'HIGH_INFRASTRUCTURE_FAILURE';

export interface LLMAnomaly {
  id: string;
  type: LLMAnomalyType;
  modelId: string;
  category?: ProblemCategory;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
  evidence: Record<string, any>;
}

export type LLMAdaptationType =
  | 'ADJUST_EXPLORATION_RATE'
  | 'DEPRIORITIZE_MODEL_CATEGORY'
  | 'SCHEDULE_TARGETED_BENCHMARK'
  | 'UPDATE_ROUTING_THRESHOLDS';

export interface LLMAdaptationPlan {
  id: string;
  anomalyId: string;
  type: LLMAdaptationType;
  description: string;
  action: Record<string, any>;
  expectedOutcome: string;
}

export interface LLMAdaptationRecord {
  id: string;
  plan: LLMAdaptationPlan;
  appliedAt: number;
  success: boolean;
  preAdaptationMetrics: Record<string, any>;
  postAdaptationMetrics?: Record<string, any>;
  verified: boolean;
}

/**
 * LLMSelfImprovementAdapter
 * 
 * Closes the real feedback loop between empirical LLM observations and routing behavior.
 * Detects real anomalies (low success, high latency, regressions, starvation of new models)
 * and executes concrete runtime adaptations:
 * 1. Exploration rate tuning
 * 2. Model cooldown / deprioritization for specific failing categories
 * 3. Targeted benchmark scheduling for unexplored models
 * 4. Uncertainty decay tuning
 */
export class LLMSelfImprovementAdapter {
  private memory: LLMPerformanceMemory;
  private registry: LLMRegistry;
  private selector: LLMSelector;
  private benchmarkEngine: LLMBenchmarkEngine;
  private adaptationHistory: LLMAdaptationRecord[] = [];

  constructor(
    memory: LLMPerformanceMemory = defaultMemory,
    registry: LLMRegistry = defaultRegistry,
    selector: LLMSelector = defaultSelector,
    benchmarkEngine: LLMBenchmarkEngine = defaultBenchmarkEngine
  ) {
    this.memory = memory;
    this.registry = registry;
    this.selector = selector;
    this.benchmarkEngine = benchmarkEngine;
  }

  /**
   * Inspects empirical evaluations and returns all detected anomalies.
   */
  public detectAnomalies(): LLMAnomaly[] {
    const anomalies: LLMAnomaly[] = [];
    const models = this.registry.discoverModels();
    const allOperationalStats = this.memory.getAllStats(OPERATIONAL_SOURCES);

    // 1. Check for sustained low success or excessive latency in operational data
    for (const stat of allOperationalStats) {
      if (stat.sampleCount >= 3 && stat.successRate < 0.4) {
        anomalies.push({
          id: `anom_low_success_${stat.modelId}_${stat.category}_${Date.now()}`,
          type: 'SUSTAINED_LOW_SUCCESS',
          modelId: stat.modelId,
          category: stat.category,
          severity: 'HIGH',
          details: `Model ${stat.modelId} in category ${stat.category} has sustained low success rate (${Math.round(stat.successRate * 100)}% over ${stat.sampleCount} samples).`,
          evidence: {
            sampleCount: stat.sampleCount,
            successRate: stat.successRate,
            meanScore: stat.meanScore,
          },
        });
      }

      if (stat.sampleCount >= 2 && stat.meanLatencyMs > 25000) {
        anomalies.push({
          id: `anom_latency_${stat.modelId}_${stat.category}_${Date.now()}`,
          type: 'EXCESSIVE_LATENCY',
          modelId: stat.modelId,
          category: stat.category,
          severity: 'MEDIUM',
          details: `Model ${stat.modelId} has excessive latency in category ${stat.category} (${stat.meanLatencyMs}ms).`,
          evidence: {
            meanLatencyMs: stat.meanLatencyMs,
            sampleCount: stat.sampleCount,
          },
        });
      }
    }

    // 2. Check for unexplored models that are configured and available
    const unmeasuredAvailable = models.filter((m) => m.availability && m.status === 'UNMEASURED');
    if (unmeasuredAvailable.length > 0) {
      for (const unmeasured of unmeasuredAvailable) {
        anomalies.push({
          id: `anom_unexplored_${unmeasured.modelId}_${Date.now()}`,
          type: 'UNEXPLORED_AVAILABLE_MODEL',
          modelId: unmeasured.modelId,
          severity: 'LOW',
          details: `Model ${unmeasured.modelId} is configured and available but completely unmeasured empirically.`,
          evidence: {
            providerId: unmeasured.providerId,
            capabilities: unmeasured.capabilities,
          },
        });
      }
    }

    return anomalies;
  }

  /**
   * Plans actionable adaptations from detected anomalies.
   */
  public planAdaptations(anomalies: LLMAnomaly[]): LLMAdaptationPlan[] {
    const plans: LLMAdaptationPlan[] = [];

    for (const anom of anomalies) {
      if (anom.type === 'SUSTAINED_LOW_SUCCESS') {
        plans.push({
          id: `plan_deprioritize_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'DEPRIORITIZE_MODEL_CATEGORY',
          description: `Place model ${anom.modelId} in temporary cooldown for failing category to route to proven models.`,
          action: {
            modelId: anom.modelId,
            cooldownSeconds: 300,
            category: anom.category,
          },
          expectedOutcome: `Immediate routing shift away from ${anom.modelId} in category ${anom.category}.`,
        });
      } else if (anom.type === 'UNEXPLORED_AVAILABLE_MODEL') {
        plans.push({
          id: `plan_boost_explore_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'ADJUST_EXPLORATION_RATE',
          description: `Temporarily boost exploration rate to discover capabilities of unmeasured model ${anom.modelId}.`,
          action: {
            targetRate: 0.25,
            modelId: anom.modelId,
          },
          expectedOutcome: `Faster sample collection for ${anom.modelId} without destabilizing production exploitation.`,
        });
      } else if (anom.type === 'EXCESSIVE_LATENCY') {
        plans.push({
          id: `plan_latency_threshold_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'UPDATE_ROUTING_THRESHOLDS',
          description: `Increase uncertainty decay factor to penalize sluggish models in real-time tasks.`,
          action: {
            uncertaintyDecayFactor: 0.40,
          },
          expectedOutcome: `Lower ranking composite score for high-latency models.`,
        });
      }
    }

    return plans;
  }

  /**
   * Executes an adaptation plan against the live runtime subsystems.
   */
  public async applyAdaptation(plan: LLMAdaptationPlan): Promise<LLMAdaptationRecord> {
    const preMetrics = {
      timestamp: Date.now(),
      explorationRate: this.selector.getConfig().explorationRate,
      unmeasuredCount: this.registry.discoverModels().filter((m) => m.status === 'UNMEASURED').length,
    };

    let success = false;

    try {
      switch (plan.type) {
        case 'ADJUST_EXPLORATION_RATE': {
          const newRate = plan.action.targetRate || 0.20;
          this.selector.updateConfig({ explorationRate: newRate });
          success = true;
          break;
        }

        case 'DEPRIORITIZE_MODEL_CATEGORY': {
          const { modelId, cooldownSeconds } = plan.action;
          quotaManager.handleCooldown(modelId, cooldownSeconds || 60, 'DEPRIORITIZE');
          success = true;
          break;
        }

        case 'UPDATE_ROUTING_THRESHOLDS': {
          const { uncertaintyDecayFactor } = plan.action;
          if (uncertaintyDecayFactor) {
            this.selector.updateConfig({ uncertaintyDecayFactor });
          }
          success = true;
          break;
        }

        case 'SCHEDULE_TARGETED_BENCHMARK': {
          const { modelId } = plan.action;
          // Trigger a lightweight benchmark run for the model
          await this.benchmarkEngine.runBenchmarks({
            candidateModels: [modelId],
            maxRequestsBudget: 2,
            isLive: false,
          });
          success = true;
          break;
        }
      }
    } catch (err) {
      console.warn(`[LLMSelfImprovementAdapter] Failed to apply adaptation plan ${plan.id}:`, err);
      success = false;
    }

    const record: LLMAdaptationRecord = {
      id: `record_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      plan,
      appliedAt: Date.now(),
      success,
      preAdaptationMetrics: preMetrics,
      verified: false,
    };

    this.adaptationHistory.push(record);
    return record;
  }

  /**
   * Verifies whether an adaptation produced the desired operational improvement.
   */
  public async verifyAdaptation(adaptationRecordId: string): Promise<boolean> {
    const record = this.adaptationHistory.find((r) => r.id === adaptationRecordId);
    if (!record || !record.success) return false;

    const currentUnmeasured = this.registry.discoverModels().filter((m) => m.status === 'UNMEASURED').length;
    const currentExplorationRate = this.selector.getConfig().explorationRate;

    record.postAdaptationMetrics = {
      timestamp: Date.now(),
      currentUnmeasured,
      currentExplorationRate,
    };

    record.verified = true;
    return true;
  }

  public getHistory(): LLMAdaptationRecord[] {
    return [...this.adaptationHistory];
  }
}

export const llmSelfImprovementAdapter = new LLMSelfImprovementAdapter();
