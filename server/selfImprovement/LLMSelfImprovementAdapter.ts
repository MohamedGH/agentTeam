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
    const allEvaluations = this.memory.getEvaluations();

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

    // 2. Check for high regression rates per model & category (STRICTLY OPERATIONAL DATA: LIVE_PROVIDER and REAL_TASK)
    const operationalEvaluations = this.memory.getEvaluations({ sources: OPERATIONAL_SOURCES });
    const modelCategoryMap = new Map<string, typeof operationalEvaluations>();
    for (const e of operationalEvaluations) {
      const key = `${e.modelId}::${e.category}`;
      if (!modelCategoryMap.has(key)) {
        modelCategoryMap.set(key, []);
      }
      modelCategoryMap.get(key)!.push(e);
    }

    for (const [key, evals] of modelCategoryMap.entries()) {
      const [modelId, category] = key.split('::') as [string, ProblemCategory];
      const total = evals.length;
      if (total >= 3) {
        const regressionCount = evals.filter((e) => e.regressionDetected).length;
        const regressionRate = regressionCount / total;
        if (regressionRate >= 0.33) {
          anomalies.push({
            id: `anom_regression_${modelId}_${category}_${Date.now()}`,
            type: 'HIGH_REGRESSION_RATE',
            modelId,
            category,
            severity: 'HIGH',
            details: `Model ${modelId} in category ${category} has excessive regression rate (${Math.round(regressionRate * 100)}% over ${total} operational observations).`,
            evidence: {
              totalObservations: total,
              regressionCount,
              regressionRate: Math.round(regressionRate * 1000) / 1000,
              source: 'OPERATIONAL_ONLY',
            },
          });
        }
      }
    }

    // 3. Check for high infrastructure / provider failure rates (STRICTLY OPERATIONAL DATA: LIVE_PROVIDER and REAL_TASK)
    const modelEvalsMap = new Map<string, typeof operationalEvaluations>();
    for (const e of operationalEvaluations) {
      if (!modelEvalsMap.has(e.modelId)) {
        modelEvalsMap.set(e.modelId, []);
      }
      modelEvalsMap.get(e.modelId)!.push(e);
    }

    for (const [modelId, evals] of modelEvalsMap.entries()) {
      const total = evals.length;
      if (total >= 3) {
        const infraFailures = evals.filter(
          (e) =>
            e.failureClass &&
            ['INFRASTRUCTURE_FAILURE', 'PROVIDER_FAILURE', 'TIMEOUT', 'AUTH_FAILURE', 'QUOTA_FAILURE'].includes(
              e.failureClass
            )
        ).length;
        const failureRate = infraFailures / total;
        if (failureRate >= 0.4) {
          anomalies.push({
            id: `anom_infra_failure_${modelId}_${Date.now()}`,
            type: 'HIGH_INFRASTRUCTURE_FAILURE',
            modelId,
            severity: 'CRITICAL',
            details: `Model ${modelId} has high infrastructure / connectivity failure rate (${Math.round(failureRate * 100)}% over ${total} operational attempts).`,
            evidence: {
              totalAttempts: total,
              infraFailures,
              failureRate: Math.round(failureRate * 1000) / 1000,
              source: 'OPERATIONAL_ONLY',
            },
          });
        }
      }
    }

    // 4. Check for unexplored models that are configured and available
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
      } else if (anom.type === 'HIGH_REGRESSION_RATE') {
        plans.push({
          id: `plan_regression_cooldown_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'DEPRIORITIZE_MODEL_CATEGORY',
          description: `Deprioritize model ${anom.modelId} in category ${anom.category} due to severe regression rate.`,
          action: {
            modelId: anom.modelId,
            cooldownSeconds: 600,
            category: anom.category,
          },
          expectedOutcome: `Immediate suppression of ${anom.modelId} in category ${anom.category} to protect codebase stability.`,
        });
      } else if (anom.type === 'HIGH_INFRASTRUCTURE_FAILURE') {
        plans.push({
          id: `plan_infra_cooldown_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'DEPRIORITIZE_MODEL_CATEGORY',
          description: `Place failing model ${anom.modelId} into cooldown to prevent repeating infrastructure failures.`,
          action: {
            modelId: anom.modelId,
            cooldownSeconds: 900,
            category: anom.category,
          },
          expectedOutcome: `Prevent traffic routing to ${anom.modelId} while provider infrastructure is unstable.`,
        });
      } else if (anom.type === 'UNEXPLORED_AVAILABLE_MODEL') {
        plans.push({
          id: `plan_target_bench_${anom.modelId}_${Date.now()}`,
          anomalyId: anom.id,
          type: 'SCHEDULE_TARGETED_BENCHMARK',
          description: `Execute targeted standardized benchmark run for unmeasured model ${anom.modelId}.`,
          action: {
            modelId: anom.modelId,
          },
          expectedOutcome: `Generate empirical evaluation records in memory for unmeasured model ${anom.modelId}.`,
        });
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
      uncertaintyDecayFactor: this.selector.getConfig().uncertaintyDecayFactor,
      unmeasuredCount: this.registry.discoverModels().filter((m) => m.status === 'UNMEASURED').length,
      evaluationCount: plan.action?.modelId ? this.memory.getModelEvaluationCount(plan.action.modelId) : 0,
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
          const { modelId, cooldownSeconds, category } = plan.action;
          if (category) {
            this.selector.deprioritizeModelCategory(modelId, category, cooldownSeconds || 300);
          } else {
            quotaManager.handleCooldown(modelId, cooldownSeconds || 60, 'DEPRIORITIZE');
          }
          success = true;
          break;
        }

        case 'UPDATE_ROUTING_THRESHOLDS': {
          const { uncertaintyDecayFactor } = plan.action;
          if (uncertaintyDecayFactor !== undefined) {
            // selector.updateConfig internally syncs and recomputes memory factor without redundant duplicate writes
            this.selector.updateConfig({ uncertaintyDecayFactor });
          }
          success = true;
          break;
        }

        case 'SCHEDULE_TARGETED_BENCHMARK': {
          const { modelId } = plan.action;
          // Trigger a lightweight benchmark run for the model
          const benchRes = await this.benchmarkEngine.runBenchmarks({
            candidateModels: [modelId],
            maxRequestsBudget: 2,
            isLive: false,
          });
          if (benchRes && benchRes.runId) {
            (plan.action as any).benchmarkRunId = benchRes.runId;
          }
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

    let verified = false;

    switch (record.plan.type) {
      case 'ADJUST_EXPLORATION_RATE': {
        const targetRate = record.plan.action.targetRate;
        const currentRate = this.selector.getConfig().explorationRate;
        verified = Math.abs(currentRate - targetRate) < 0.001;
        record.postAdaptationMetrics = {
          timestamp: Date.now(),
          currentExplorationRate: currentRate,
          targetExplorationRate: targetRate,
          verified,
        };
        break;
      }

      case 'DEPRIORITIZE_MODEL_CATEGORY': {
        const { modelId, category } = record.plan.action;
        if (category) {
          const isTargetDeprioritized = this.selector.isModelDeprioritizedForCategory(modelId, category);
          const otherCategory: ProblemCategory = category === 'CODE_GENERATION' ? 'SECURITY' : 'CODE_GENERATION';
          const isOtherDeprioritized = this.selector.isModelDeprioritizedForCategory(modelId, otherCategory);
          verified = isTargetDeprioritized && !isOtherDeprioritized;
          record.postAdaptationMetrics = {
            timestamp: Date.now(),
            modelId,
            category,
            isTargetDeprioritized,
            isOtherDeprioritized,
            verified,
          };
        } else {
          const inCooldown = quotaManager.isModelInCooldown(modelId);
          verified = inCooldown;
          record.postAdaptationMetrics = {
            timestamp: Date.now(),
            modelId,
            inCooldown,
            verified,
          };
        }
        break;
      }

      case 'UPDATE_ROUTING_THRESHOLDS': {
        const targetFactor = record.plan.action.uncertaintyDecayFactor;
        const currentConfigFactor = this.selector.getConfig().uncertaintyDecayFactor;
        const currentMemoryFactor = this.memory.getUncertaintyDecayFactor();
        verified =
          Math.abs(currentConfigFactor - targetFactor) < 0.001 &&
          Math.abs(currentMemoryFactor - targetFactor) < 0.001;
        record.postAdaptationMetrics = {
          timestamp: Date.now(),
          targetFactor,
          currentConfigFactor,
          currentMemoryFactor,
          verified,
        };
        break;
      }

      case 'SCHEDULE_TARGETED_BENCHMARK': {
        const { modelId, benchmarkRunId } = record.plan.action;
        const preCount = record.preAdaptationMetrics.evaluationCount || 0;
        const postCount = this.memory.getModelEvaluationCount(modelId);
        
        // Strict verification: postCount > preCount AND newly added evaluations match modelId, valid benchmark source, and post-plan timestamp
        const recentEvals = this.memory.getEvaluations().filter((e) => {
          const isTargetModel = e.modelId === modelId;
          const isBenchmarkSource = e.evaluationSource === 'LIVE_PROVIDER' || e.evaluationSource === 'HERMETIC_FIXTURE';
          const isPostPlan = e.timestamp >= (record.appliedAt - 5000);
          const matchesRunId = benchmarkRunId ? e.runId === benchmarkRunId : true;
          return isTargetModel && isBenchmarkSource && isPostPlan && matchesRunId;
        });

        verified = Boolean(postCount > preCount && recentEvals.length > 0);
        record.postAdaptationMetrics = {
          timestamp: Date.now(),
          modelId,
          preEvaluationCount: preCount,
          postEvaluationCount: postCount,
          matchedNewBenchmarkEvaluations: recentEvals.length,
          verified,
        };
        break;
      }

      default:
        verified = false;
    }

    record.verified = verified;
    return verified;
  }

  public getHistory(): LLMAdaptationRecord[] {
    return [...this.adaptationHistory];
  }
}

export const llmSelfImprovementAdapter = new LLMSelfImprovementAdapter();
