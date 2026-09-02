import { GoogleGenAI } from '@google/genai';
import { IAIProvider, AIProviderId, ProviderModelConfig, GenerationUsageResult, TokenCountResult } from './providers/types';
import { GeminiProvider } from './providers/geminiProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
import { GroqProvider, DeepSeekProvider, CustomProvider } from './providers/otherProviders';
import { MockProvider } from './providers/mockProvider';
import { cloudMonitoringQuotaService, CloudMonitoringQuotaResult } from './cloudMonitoring';
import { quotaManager } from './quotaManager';

export interface ProviderInfo {
  id: AIProviderId;
  name: string;
  configured: boolean;
  active: boolean;
  models: ProviderModelConfig[];
  defaultModel: string;
  sourceType: string;
  tokenCounterSupported: boolean;
}

export interface ProviderHealthStatus {
  service: string;
  activeProvider: AIProviderId;
  configuredProviders: AIProviderId[];
  hasApiKey: boolean;
  cloudMonitoringActive: boolean;
  monitoringSource: string;
  cacheTtlRemainingSeconds: number;
  activeModelsCount: number;
  timestamp: string;
}

/**
 * ProviderManager (provider_manager)
 * 
 * Unified Multi-Provider AI Controller with:
 * - Clean polymorphic interface (IAIProvider) across all providers.
 * - Robust activeModelOverride management per provider.
 * - True automatic multi-model & multi-provider failover when rate limits (429) or high demand (503) occur.
 * - Hermetic mocking support for zero-quota testing.
 */
export class ProviderManager {
  private providers: Map<AIProviderId, IAIProvider> = new Map();
  private activeProvider: AIProviderId = 'gemini';
  private activeModelOverrides: Partial<Record<AIProviderId, string>> = {};

  constructor() {
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new AnthropicProvider());
    this.registerProvider(new GroqProvider());
    this.registerProvider(new DeepSeekProvider());
    this.registerProvider(new CustomProvider());
    this.registerProvider(new MockProvider());
  }

  public registerProvider(provider: IAIProvider) {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: AIProviderId): IAIProvider {
    const p = this.providers.get(id);
    if (!p) {
      throw new Error(`AI Provider "${id}" is not registered`);
    }
    return p;
  }

  public getGeminiClient(): GoogleGenAI | null {
    const gemini = this.providers.get('gemini') as GeminiProvider;
    return gemini ? gemini.getClient() : null;
  }

  // Alias for backward compatibility
  public getClient(): GoogleGenAI | null {
    return this.getGeminiClient();
  }

  public getActiveProvider(): AIProviderId {
    return this.activeProvider;
  }

  public setActiveProvider(provider: AIProviderId, model?: string): void {
    if (this.providers.has(provider)) {
      this.activeProvider = provider;
      if (model) {
        this.activeModelOverrides[provider] = model;
      }
    }
  }

  /**
   * Set or clear active model override for a specific provider
   */
  public setModelOverride(provider: AIProviderId, model: string | null): void {
    if (model) {
      this.activeModelOverrides[provider] = model;
    } else {
      delete this.activeModelOverrides[provider];
    }
  }

  public getModelOverride(provider: AIProviderId = this.activeProvider): string | null {
    return this.activeModelOverrides[provider] || null;
  }

  public clearAllModelOverrides(): void {
    this.activeModelOverrides = {};
  }

  public isProviderConfigured(provider: AIProviderId): boolean {
    const p = this.providers.get(provider);
    return p ? p.isConfigured() : false;
  }

  public getProvidersList(): ProviderInfo[] {
    const list: ProviderInfo[] = [];
    for (const [id, p] of this.providers.entries()) {
      if (id === 'mock') continue; // Hidden from standard customer list
      list.push({
        id,
        name: p.name,
        configured: p.isConfigured(),
        active: this.activeProvider === id,
        models: p.models,
        defaultModel: this.activeModelOverrides[id] || p.defaultModel,
        sourceType: p.sourceType,
        tokenCounterSupported: p.tokenCounterSupported,
      });
    }
    return list;
  }

  public hasValidCredentials(provider: AIProviderId = this.activeProvider): boolean {
    return this.isProviderConfigured(provider);
  }

  /**
   * Fetches real quota status using Google Cloud Monitoring / Service Usage (for Gemini)
   */
  public async getRealQuotaMetrics(forceRefresh = false): Promise<CloudMonitoringQuotaResult> {
    return await cloudMonitoringQuotaService.fetchRealQuotaMetrics(forceRefresh);
  }

  /**
   * Selects optimal model based on provider, activeModelOverride, and cooldown status
   */
  public async selectOptimalModel(
    preferredModels?: string[],
    tier = 'tier_3',
    estimatedTokens = 1000,
    providerId: AIProviderId = this.activeProvider
  ): Promise<string> {
    const provider = this.getProvider(providerId);

    // 1. Check if user configured an active model override for this provider
    const override = this.activeModelOverrides[providerId];
    if (override) {
      if (!quotaManager.isModelInCooldown(override)) {
        return override;
      }
      console.warn(`[ProviderManager] Active model override "${override}" for ${providerId} is in cooldown. Selecting alternative.`);
    }

    // 2. Gemini model selection with dynamic quota headroom
    if (providerId === 'gemini') {
      await this.getRealQuotaMetrics();
      const candidates = preferredModels || provider.models.map((m) => m.name);
      const selected = quotaManager.selectBestModel(candidates, tier, estimatedTokens);
      return selected || candidates[0] || provider.defaultModel;
    }

    // 3. Other providers: choose from preferred or default
    if (preferredModels && preferredModels.length > 0) {
      const match = preferredModels.find((m) => provider.models.some((pm) => pm.name === m));
      if (match && !quotaManager.isModelInCooldown(match)) {
        return match;
      }
    }

    const available = provider.models.find((m) => !quotaManager.isModelInCooldown(m.name));
    return available ? available.name : provider.defaultModel;
  }

  /**
   * Unified generation method with automatic multi-model and multi-provider failover
   */
  public async generateWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role = 'agent',
    providerOverride?: AIProviderId
  ): Promise<GenerationUsageResult> {
    const targetProviderId = providerOverride || this.inferProviderFromModel(model) || this.activeProvider;
    const failoverHistory: Array<{ provider: AIProviderId; model: string; error?: string }> = [];

    // Construct an ordered failover sequence of providers
    const providerPriority: AIProviderId[] = [
      targetProviderId,
      'gemini',
      'openai',
      'anthropic',
      'groq',
      'deepseek',
      'custom',
    ];
    const uniqueProviders = Array.from(new Set(providerPriority));

    for (const provId of uniqueProviders) {
      const provider = this.providers.get(provId);
      if (!provider || !provider.isConfigured()) {
        continue;
      }

      // Candidate models for this provider
      const candidateModels = provId === targetProviderId
        ? Array.from(new Set([model, this.activeModelOverrides[provId], ...provider.models.map((m) => m.name)].filter(Boolean))) as string[]
        : provider.models.map((m) => m.name);

      for (const candidateModel of candidateModels) {
        if (quotaManager.isModelInCooldown(candidateModel)) {
          continue;
        }

        try {
          const res = await provider.generateContent({
            model: candidateModel,
            prompt,
            fallbackText,
            role,
          });

          this.recordModelUsage(candidateModel, {
            promptTokenCount: res.promptTokens,
            candidatesTokenCount: res.completionTokens,
            totalTokenCount: res.totalTokens,
          });

          return {
            ...res,
            failoverHistory: failoverHistory.length > 0 ? failoverHistory : undefined,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          failoverHistory.push({ provider: provId, model: candidateModel, error: errMsg });

          const is503 = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand');
          const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');

          if (is503) {
            console.warn(`[ProviderManager] 503 High Demand on ${provId} (${candidateModel}). Triggering cooldown & automatic failover.`);
            quotaManager.handle503Error(candidateModel, 30);
          } else if (is429) {
            console.warn(`[ProviderManager] 429 Rate Limit on ${provId} (${candidateModel}). Triggering cooldown & automatic failover.`);
            quotaManager.handle429Error(candidateModel, 60);
          } else {
            console.warn(`[ProviderManager] Error on ${provId} (${candidateModel}): ${errMsg.substring(0, 100)}. Failing over...`);
          }
        }
      }
    }

    // If all configured providers fail or none are configured, return clean graceful fallback
    const promptTokens = Math.max(60, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(30, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: targetProviderId,
      model,
      isRealProviderUsage: false,
      failoverHistory: failoverHistory.length > 0 ? failoverHistory : undefined,
    };
  }

  public inferProviderFromModel(model: string): AIProviderId | null {
    if (model.startsWith('gemini-')) return 'gemini';
    if (model.startsWith('gpt-') || model.startsWith('o3-') || model.startsWith('text-embedding-')) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('llama-') || model.startsWith('mixtral-')) return 'groq';
    if (model.startsWith('deepseek-')) return 'deepseek';
    if (model.startsWith('mock-')) return 'mock';
    return null;
  }

  /**
   * Real-time token counter using provider's native API or heuristic
   */
  public async countRealTokens(model: string, text: string): Promise<TokenCountResult> {
    const provId = this.inferProviderFromModel(model) || this.activeProvider;
    const provider = this.providers.get(provId);
    if (provider && provider.isConfigured()) {
      return await provider.countTokens(model, text);
    }
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }

  /**
   * Records usage metrics after model execution
   */
  public recordModelUsage(
    model: string,
    usage: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number } = {}
  ): void {
    quotaManager.recordUsage(model, usage);
  }

  /**
   * Handles 429 Rate Limit / Quota Exceeded error by activating cooldown
   */
  public handleRateLimitError(model: string, retryAfterSeconds = 60): void {
    quotaManager.handle429Error(model, retryAfterSeconds);
    cloudMonitoringQuotaService.invalidateCache();
  }

  /**
   * Returns comprehensive provider health check
   */
  public async getHealthStatus(): Promise<ProviderHealthStatus> {
    const monitoringResult = await this.getRealQuotaMetrics();
    const cacheStatus = cloudMonitoringQuotaService.getCacheStatus();
    const configuredList = (Array.from(this.providers.keys()) as AIProviderId[]).filter((id) =>
      this.isProviderConfigured(id)
    );

    return {
      service: 'multi_provider_ai_engine',
      activeProvider: this.activeProvider,
      configuredProviders: configuredList,
      hasApiKey: this.hasValidCredentials(),
      cloudMonitoringActive: monitoringResult.authenticated || monitoringResult.source === 'google_cloud_monitoring',
      monitoringSource: monitoringResult.source,
      cacheTtlRemainingSeconds: cacheStatus.ttlRemainingSeconds,
      activeModelsCount: this.getAvailableModels().length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns all available models across all providers
   */
  public getAvailableModels(): ProviderModelConfig[] {
    const all: ProviderModelConfig[] = [];
    for (const p of this.providers.values()) {
      if (p.id === 'mock') continue;
      all.push(...p.models);
    }
    return all;
  }

  /**
   * Returns complete unified quota status for all models (combining Cloud Monitoring + Quota state)
   */
  public async getAllQuotaStatus(tier = 'tier_3', forceRefresh = false) {
    const monitoringResult = await this.getRealQuotaMetrics(forceRefresh);
    const localState = quotaManager.allStatus(tier);
    const cacheStatus = cloudMonitoringQuotaService.getCacheStatus();

    const merged: Record<string, any> = {};

    for (const [model, status] of Object.entries(localState)) {
      const cloudModelData = monitoringResult.models[model] || {};
      const providerId = this.inferProviderFromModel(model) || 'gemini';

      merged[model] = {
        ...status,
        provider: providerId,
        monitoringSource: providerId === 'gemini' ? monitoringResult.source : `${providerId.toUpperCase()} API Telemetry`,
        cloudRpmLimit: cloudModelData.rpm_limit ?? status.rpm_limit,
        cloudRpdLimit: cloudModelData.rpd_limit ?? status.rpd_limit,
        cacheAgeSeconds: cacheStatus.ageSeconds,
        cacheTtlSeconds: cacheStatus.ttlRemainingSeconds,
      };
    }

    return {
      tier,
      activeProvider: this.activeProvider,
      monitoringSource: monitoringResult.source,
      authenticated: monitoringResult.authenticated,
      cacheAgeSeconds: cacheStatus.ageSeconds,
      cacheTtlSeconds: cacheStatus.ttlRemainingSeconds,
      models: merged,
      totalModels: Object.keys(merged).length,
    };
  }
}

export const providerManager = new ProviderManager();
// Export alias for provider_manager integration requirement
export const provider_manager = providerManager;
