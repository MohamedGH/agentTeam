import { ProviderManager, providerManager as defaultProviderManager } from '../providerManager';
import { AIProviderId, ProviderModelConfig } from '../providers/types';
import { quotaManager } from '../quotaManager';
import { LLMModelEntry, LLMStatus } from './types';
import { LLMPerformanceMemory } from './LLMPerformanceMemory';

/**
 * LLMRegistry
 * 
 * Dynamically queries ProviderManager and registered providers.
 * Reflects models actually available, without static duplicate lists.
 * Associates empirical evaluation status (UNMEASURED, LOW_CONFIDENCE, MEASURED, UNAVAILABLE).
 */
export class LLMRegistry {
  private providerMgr: ProviderManager;
  private memory?: LLMPerformanceMemory;

  constructor(providerMgr: ProviderManager = defaultProviderManager, memory?: LLMPerformanceMemory) {
    this.providerMgr = providerMgr;
    this.memory = memory;
  }

  public setMemory(memory: LLMPerformanceMemory): void {
    this.memory = memory;
  }

  /**
   * Discovers all available models dynamically from registered providers.
   */
  public discoverModels(): LLMModelEntry[] {
    const entries: LLMModelEntry[] = [];
    const providersList = this.providerMgr.getProviders();

    for (const p of providersList) {
      const isProviderConfigured = p.configured;

      for (const m of p.models) {
        const inCooldown = quotaManager.isModelInCooldown(m.name);
        const isAvailable = isProviderConfigured && !inCooldown;

        // Query memory for empirical status
        let status: LLMStatus = 'UNMEASURED';
        let evalCount = 0;
        let lastEvaluatedAt: number | undefined;

        if (this.memory) {
          evalCount = this.memory.getModelEvaluationCount(m.name);
          lastEvaluatedAt = this.memory.getModelLastEvaluatedAt(m.name);
          if (!isAvailable) {
            status = 'UNAVAILABLE';
          } else if (evalCount === 0) {
            status = 'UNMEASURED';
          } else if (evalCount < 3) {
            status = 'LOW_CONFIDENCE';
          } else {
            status = 'MEASURED';
          }
        } else {
          status = isAvailable ? 'UNMEASURED' : 'UNAVAILABLE';
        }

        const capabilities = this.deriveCapabilities(m, p.id);

        entries.push({
          providerId: p.id,
          modelId: m.name,
          version: this.extractVersion(m.name),
          capabilities,
          availability: isAvailable,
          costTier: m.costTier,
          contextWindow: m.contextWindow,
          status,
          evaluationHistoryCount: evalCount,
          lastEvaluatedAt,
        });
      }
    }

    return entries;
  }

  /**
   * Retrieves single model metadata
   */
  public getModel(modelId: string): LLMModelEntry | null {
    const models = this.discoverModels();
    return models.find((m) => m.modelId === modelId) || null;
  }

  /**
   * Filters candidate models suitable for a set of capabilities and availability
   */
  public getEligibleCandidates(
    requiredCapabilities: string[] = [],
    allowUnmeasured = true,
    preferredProviders?: AIProviderId[]
  ): LLMModelEntry[] {
    const all = this.discoverModels();
    return all.filter((entry) => {
      if (!entry.availability) return false;
      if (!allowUnmeasured && entry.status === 'UNMEASURED') return false;
      if (preferredProviders && preferredProviders.length > 0 && !preferredProviders.includes(entry.providerId)) {
        return false;
      }
      return true;
    });
  }

  private deriveCapabilities(m: ProviderModelConfig, providerId: AIProviderId): string[] {
    const caps = ['code_synthesis', 'general_reasoning'];
    if (m.supportsTools) caps.push('function_calling', 'tools');
    if (m.contextWindow >= 128000) caps.push('large_context_window');
    if (m.costTier === 'ultra' || m.costTier === 'pro') caps.push('deep_reasoning');
    if (providerId === 'gemini') caps.push('multimodal', 'google_grounding');
    return caps;
  }

  private extractVersion(modelName: string): string | undefined {
    const match = modelName.match(/(?:-|\b)(v?\d+(?:\.\d+)*(?:-preview|-flash|-pro|-turbo)?)/i);
    return match ? match[1] : undefined;
  }
}

export const llmRegistry = new LLMRegistry();
