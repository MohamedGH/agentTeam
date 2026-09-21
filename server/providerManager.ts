import { GoogleGenAI } from '@google/genai';
import {
  IAIProvider,
  AIProviderId,
  ProviderModelConfig,
  GenerationUsageResult,
  TokenCountResult,
  GenerationOutcome,
} from './providers/types';
import {
  classifyProviderError,
  sanitizeErrorMessage,
} from './providers/errorClassifier';
import type {
  FailoverRecord,
  ProviderErrorReason,
  ClassifiedProviderError,
} from './providers/errorClassifier';

export {
  classifyProviderError,
  sanitizeErrorMessage,
};
export type {
  FailoverRecord,
  ProviderErrorReason,
  ClassifiedProviderError,
};
import { GeminiProvider } from './providers/geminiProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
import { GroqProvider, DeepSeekProvider, CustomProvider } from './providers/otherProviders';
import { MockProvider } from './providers/mockProvider';
import { cloudMonitoringQuotaService, CloudMonitoringQuotaResult } from './cloudMonitoring';
import { quotaManager } from './quotaManager';
import type { ExactBenchmarkExecutionResult } from './llm/types';

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

  constructor(options?: { registerDefaults?: boolean }) {
    if (options?.registerDefaults !== false) {
      this.registerProvider(new GeminiProvider());
      this.registerProvider(new OpenAIProvider());
      this.registerProvider(new AnthropicProvider());
      this.registerProvider(new GroqProvider());
      this.registerProvider(new DeepSeekProvider());
      this.registerProvider(new CustomProvider());
      this.registerProvider(new MockProvider());
    }
  }

  public clearProviders(): void {
    this.providers.clear();
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

  public getProvidersList(includeMock = false): ProviderInfo[] {
    const list: ProviderInfo[] = [];
    for (const [id, p] of this.providers.entries()) {
      if (id === 'mock' && !includeMock) continue; // Hidden from standard customer list unless requested
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

  public getProviders(includeMock = true): ProviderInfo[] {
    return this.getProvidersList(includeMock);
  }

  public getAllRegisteredProviders(): IAIProvider[] {
    return Array.from(this.providers.values());
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
    const failoverHistory: FailoverRecord[] = [];
    const attempted = new Set<string>();
    const blockedProviders = new Set<AIProviderId>();
    const MAX_FAILOVER_BUDGET = 8;

    // Construct an ordered failover sequence of providers:
    // Preferred provider -> other configured providers in priority order
    const providerPriority: AIProviderId[] = targetProviderId === 'mock'
      ? ['mock']
      : [
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
      if (blockedProviders.has(provId)) {
        continue;
      }

      const provider = this.providers.get(provId);
      if (!provider || !provider.isConfigured()) {
        continue;
      }

      // Candidate models for this provider:
      // If primary target provider: requested model first, then active override, then remaining models
      // If alternative provider: models sorted by quota availability and readiness
      let rawCandidateModels: string[] = [];
      if (provId === targetProviderId) {
        const remaining = provider.models.map((m) => m.name).filter((n) => n !== model && n !== this.activeModelOverrides[provId]);
        rawCandidateModels = [
          model,
          this.activeModelOverrides[provId],
          ...remaining,
        ].filter(Boolean) as string[];
      } else {
        // Alternative provider: prioritize default model, then other models
        const def = this.activeModelOverrides[provId] || provider.defaultModel;
        const others = provider.models.map((m) => m.name).filter((n) => n !== def);
        rawCandidateModels = [def, ...others];
      }

      // Deduplicate candidate models
      const candidateModels = Array.from(new Set(rawCandidateModels));

      for (const candidateModel of candidateModels) {
        const attemptKey = `${provId}:${candidateModel}`;

        // Never attempt the same provider/model twice in a single request
        if (attempted.has(attemptKey)) {
          continue;
        }

        // Avoid models currently in cooldown
        if (quotaManager.isModelInCooldown(candidateModel)) {
          const remainingSec = quotaManager.getCooldownRemainingSeconds(candidateModel);
          console.log(`[ProviderManager] Candidate ${provId}/${candidateModel} is in cooldown (${remainingSec}s remaining). Skipping.`);
          continue;
        }

        // Avoid models with exhausted quota if headroom check is possible
        const quotaCheck = quotaManager.canUseModel(candidateModel, 'tier_3', 1000);
        if (!quotaCheck.ok) {
          console.log(`[ProviderManager] Candidate ${provId}/${candidateModel} skipped due to quota: ${quotaCheck.reason}`);
          continue;
        }

        // Check failover budget
        if (attempted.size >= MAX_FAILOVER_BUDGET) {
          console.warn(`[ProviderManager] Max failover budget reached (${MAX_FAILOVER_BUDGET} attempts). Halting further failover attempts.`);
          break;
        }

        attempted.add(attemptKey);
        console.log(`[ProviderManager] Attempting ${provId}/${candidateModel}`);

        try {
          const res = await provider.generateContent({
            model: candidateModel,
            prompt,
            fallbackText,
            role,
          });

          console.log(`[ProviderManager] Success using ${provId}/${candidateModel}`);

          this.recordModelUsage(candidateModel, {
            promptTokenCount: res.promptTokens,
            candidatesTokenCount: res.completionTokens,
            totalTokenCount: res.totalTokens,
          });

          const generationOutcome: GenerationOutcome =
            res.generationOutcome === 'DEGRADED_FALLBACK'
              ? 'DEGRADED_FALLBACK'
              : (res.generationOutcome ||
                (provId === 'mock'
                  ? 'MOCK_SUCCESS'
                  : (res.isRealProviderUsage === true && res.text !== fallbackText && res.generationOutcome !== 'DEGRADED_FALLBACK'
                      ? 'REAL_PROVIDER_SUCCESS'
                      : 'DEGRADED_FALLBACK')));

          return {
            ...res,
            provider: provId,
            model: candidateModel,
            failoverHistory: failoverHistory.length > 0 ? failoverHistory : undefined,
            generationOutcome,
          };
        } catch (err: any) {
          const classified = classifyProviderError(err);

          failoverHistory.push({
            provider: provId,
            model: candidateModel,
            reason: classified.reason,
            retryable: classified.retryable,
            error: classified.sanitizedMessage,
            timestamp: Date.now(),
          });

          if (classified.retryable) {
            console.warn(
              `[ProviderManager] Retryable failure: ${classified.reason} on ${provId}/${candidateModel} - ${classified.sanitizedMessage}`
            );
          } else {
            console.warn(
              `[ProviderManager] Non-retryable failure: ${classified.reason} on ${provId}/${candidateModel} - ${classified.sanitizedMessage}`
            );
          }

          // Calculate cooldown duration based on error classification and retry-after header
          let cooldownSec = classified.retryAfterSeconds;
          if (!cooldownSec || cooldownSec <= 0) {
            if (classified.reason === 'RATE_LIMIT') cooldownSec = 60;
            else if (classified.reason === 'QUOTA') cooldownSec = 120;
            else if (classified.reason === 'HIGH_DEMAND') cooldownSec = 30;
            else if (classified.reason === 'TEMPORARY_UNAVAILABLE') cooldownSec = 20;
            else if (classified.reason === 'MODEL_EXECUTION_ERROR') cooldownSec = 15;
            else cooldownSec = 30;
          }

          // Handle non-retryable authentication or configuration errors
          if (classified.reason === 'AUTHENTICATION' || classified.reason === 'CONFIGURATION') {
            blockedProviders.add(provId);
            console.warn(
              `[ProviderManager] Provider "${provId}" encountered non-retryable ${classified.reason}. Blocking provider for remainder of request.`
            );
            // Break from candidate models loop for this provider, move to next provider
            break;
          }

          // Apply cooldown to this candidate model without destroying longer existing cooldowns
          quotaManager.handleCooldown(candidateModel, cooldownSec, classified.reason);
          console.log(`[ProviderManager] Cooling down ${provId}/${candidateModel} for ${cooldownSec} seconds`);

          console.log(`[ProviderManager] Failing over to next candidate model/provider...`);
        }
      }

      if (attempted.size >= MAX_FAILOVER_BUDGET) {
        break;
      }
    }

    // If all configured providers fail or none are configured, return clean graceful fallback
    console.warn(`[ProviderManager] All candidate models/providers exhausted or unconfigured. Returning graceful fallback.`);
    return {
      text: fallbackText,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      provider: targetProviderId,
      model,
      isRealProviderUsage: false,
      tokenAccountingType: 'fallback_unknown',
      generationOutcome: 'DEGRADED_FALLBACK',
      failoverHistory: failoverHistory.length > 0 ? failoverHistory : undefined,
    };
  }

  /**
   * Generates content for an EXACT requested model and provider with ZERO failover.
   * Dedicated to empirical benchmarking and fair comparative evaluation.
   * Never falls back to alternative models or providers.
   */
  public async generateExactModelForBenchmark(options: {
    providerId: AIProviderId;
    modelId: string;
    prompt: string;
    fallbackText?: string;
    role?: string;
    timeoutMs?: number;
  }): Promise<ExactBenchmarkExecutionResult> {
    const { providerId, modelId, prompt, fallbackText, role, timeoutMs = 60000 } = options;
    const startTime = Date.now();

    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        text: '',
        requestedModelId: modelId,
        requestedProviderId: providerId,
        actualModelId: modelId,
        actualProviderId: providerId,
        failoverUsed: false,
        success: false,
        error: `Provider "${providerId}" is not registered`,
        latencyMs: Date.now() - startTime,
      };
    }

    if (!provider.isConfigured()) {
      return {
        text: '',
        requestedModelId: modelId,
        requestedProviderId: providerId,
        actualModelId: modelId,
        actualProviderId: providerId,
        failoverUsed: false,
        success: false,
        error: `Provider "${providerId}" is not configured (missing credentials or API key)`,
        latencyMs: Date.now() - startTime,
      };
    }

    // Ensure model is supported by this provider
    const modelSupported = provider.models.some((m) => m.name === modelId);
    if (!modelSupported) {
      return {
        text: '',
        requestedModelId: modelId,
        requestedProviderId: providerId,
        actualModelId: modelId,
        actualProviderId: providerId,
        failoverUsed: false,
        success: false,
        error: `Model "${modelId}" is not supported by provider "${providerId}"`,
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      // Execute only this specific model on this provider with timeout protection
      let timeoutHandle: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Exact benchmark execution timed out after ${timeoutMs}ms for ${providerId}/${modelId}`));
        }, timeoutMs);
      });

      const genPromise = provider.generateContent({
        model: modelId,
        prompt,
        fallbackText: fallbackText || '',
        role,
      });

      const res = await Promise.race([genPromise, timeoutPromise]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });

      const latencyMs = Date.now() - startTime;

      if (res.isRealProviderUsage || providerId === 'mock') {
        this.recordModelUsage(modelId, {
          promptTokenCount: res.promptTokens,
          candidatesTokenCount: res.completionTokens,
          totalTokenCount: res.totalTokens,
        });
      }

      return {
        text: res.text,
        requestedModelId: modelId,
        requestedProviderId: providerId,
        actualModelId: modelId,
        actualProviderId: providerId,
        failoverUsed: false,
        totalTokens: res.totalTokens,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        success: true,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const classified = classifyProviderError(err);
      console.warn(`[ProviderManager] Exact benchmark execution failed for ${providerId}/${modelId}:`, classified.sanitizedMessage);

      if (classified.reason === 'RATE_LIMIT') {
        this.handleRateLimitError(modelId, classified.retryAfterSeconds || 60);
      }

      return {
        text: '',
        requestedModelId: modelId,
        requestedProviderId: providerId,
        actualModelId: modelId,
        actualProviderId: providerId,
        failoverUsed: false,
        success: false,
        error: classified.sanitizedMessage,
        latencyMs,
      };
    }
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
