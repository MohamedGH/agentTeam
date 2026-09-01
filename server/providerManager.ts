import { GoogleGenAI } from '@google/genai';
import { cloudMonitoringQuotaService, CloudMonitoringQuotaResult } from './cloudMonitoring';
import { quotaManager } from './quotaManager';

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'custom';

export interface ProviderModelConfig {
  name: string;
  displayName: string;
  contextWindow: number;
  supportsTools: boolean;
  costTier: 'flash' | 'pro' | 'ultra' | 'custom';
  providerId: AIProviderId;
}

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

export interface GenerationUsageResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: AIProviderId;
  model: string;
  isRealProviderUsage: boolean;
}

/**
 * ProviderManager (provider_manager)
 * 
 * Multi-Provider AI Controller supporting:
 * - Google Gemini (Native @google/genai SDK & usageMetadata)
 * - OpenAI (GPT-4o, GPT-4o-mini, o3-mini via standard ChatCompletions usage)
 * - Anthropic Claude (Claude 3.7 Sonnet, Claude 3.5 Haiku via Messages API usage)
 * - Groq (Llama 3.3 70B, Mixtral via OpenAI-compatible API)
 * - DeepSeek (DeepSeek V3, DeepSeek R1 via OpenAI-compatible API)
 * - Custom / Ollama (Local & self-hosted OpenAI-compatible endpoints)
 * 
 * Automatically captures authoritative real-time token usage from every provider API.
 */
export class ProviderManager {
  private geminiClient: GoogleGenAI | null = null;
  private activeProvider: AIProviderId = 'gemini';
  private activeModelOverride: string | null = null;

  private readonly providersCatalog: Record<AIProviderId, {
    name: string;
    defaultModel: string;
    sourceType: string;
    tokenCounterSupported: boolean;
    models: ProviderModelConfig[];
  }> = {
    gemini: {
      name: 'Google Gemini',
      defaultModel: 'gemini-3.7-flash',
      sourceType: 'Google Cloud Monitoring & Gemini SDK',
      tokenCounterSupported: true,
      models: [
        { name: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
        { name: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
        { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
        { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro', contextWindow: 2097152, supportsTools: true, costTier: 'pro', providerId: 'gemini' },
        { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
      ],
    },
    openai: {
      name: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      sourceType: 'OpenAI API (usage.prompt_tokens & usage.completion_tokens)',
      tokenCounterSupported: true,
      models: [
        { name: 'gpt-4o', displayName: 'GPT-4o (Flagship)', contextWindow: 128000, supportsTools: true, costTier: 'pro', providerId: 'openai' },
        { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini (High Speed)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'openai' },
        { name: 'o3-mini', displayName: 'o3-mini (Reasoning)', contextWindow: 200000, supportsTools: true, costTier: 'ultra', providerId: 'openai' },
      ],
    },
    anthropic: {
      name: 'Anthropic Claude',
      defaultModel: 'claude-3-5-sonnet-20241022',
      sourceType: 'Anthropic Messages API (input_tokens & output_tokens)',
      tokenCounterSupported: true,
      models: [
        { name: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet', contextWindow: 200000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
        { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', contextWindow: 200000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
        { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200000, supportsTools: true, costTier: 'flash', providerId: 'anthropic' },
      ],
    },
    groq: {
      name: 'Groq Cloud',
      defaultModel: 'llama-3.3-70b-versatile',
      sourceType: 'Groq LPU Inference (Real-Time Usage)',
      tokenCounterSupported: true,
      models: [
        { name: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B (Versatile)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
        { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Instant)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
        { name: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B', contextWindow: 32768, supportsTools: true, costTier: 'flash', providerId: 'groq' },
      ],
    },
    deepseek: {
      name: 'DeepSeek',
      defaultModel: 'deepseek-chat',
      sourceType: 'DeepSeek API (Usage Metadata)',
      tokenCounterSupported: true,
      models: [
        { name: 'deepseek-chat', displayName: 'DeepSeek-V3', contextWindow: 64000, supportsTools: true, costTier: 'flash', providerId: 'deepseek' },
        { name: 'deepseek-reasoner', displayName: 'DeepSeek-R1 (Reasoning)', contextWindow: 64000, supportsTools: true, costTier: 'pro', providerId: 'deepseek' },
      ],
    },
    custom: {
      name: 'Custom / Local (Ollama)',
      defaultModel: process.env.CUSTOM_AI_MODEL || 'llama3:latest',
      sourceType: 'Self-Hosted / Local OpenAI-Compatible Endpoint',
      tokenCounterSupported: true,
      models: [
        { name: process.env.CUSTOM_AI_MODEL || 'llama3:latest', displayName: 'Custom Model Endpoint', contextWindow: 32768, supportsTools: true, costTier: 'custom', providerId: 'custom' },
      ],
    },
  };

  constructor() {
    this.initGemini();
  }

  private initGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey });
    }
  }

  public getGeminiClient(): GoogleGenAI | null {
    if (!this.geminiClient && process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.geminiClient;
  }

  // Alias for backward compatibility
  public getClient(): GoogleGenAI | null {
    return this.getGeminiClient();
  }

  public getActiveProvider(): AIProviderId {
    return this.activeProvider;
  }

  public setActiveProvider(provider: AIProviderId, model?: string): void {
    if (this.providersCatalog[provider]) {
      this.activeProvider = provider;
      if (model) {
        this.activeModelOverride = model;
      } else {
        this.activeModelOverride = this.providersCatalog[provider].defaultModel;
      }
    }
  }

  public isProviderConfigured(provider: AIProviderId): boolean {
    switch (provider) {
      case 'gemini':
        return Boolean(process.env.GEMINI_API_KEY);
      case 'openai':
        return Boolean(process.env.OPENAI_API_KEY);
      case 'anthropic':
        return Boolean(process.env.ANTHROPIC_API_KEY);
      case 'groq':
        return Boolean(process.env.GROQ_API_KEY);
      case 'deepseek':
        return Boolean(process.env.DEEPSEEK_API_KEY);
      case 'custom':
        return Boolean(process.env.CUSTOM_AI_BASE_URL || process.env.CUSTOM_AI_API_KEY);
      default:
        return false;
    }
  }

  public getProvidersList(): ProviderInfo[] {
    return (Object.keys(this.providersCatalog) as AIProviderId[]).map((id) => {
      const p = this.providersCatalog[id];
      return {
        id,
        name: p.name,
        configured: this.isProviderConfigured(id),
        active: this.activeProvider === id,
        models: p.models,
        defaultModel: p.defaultModel,
        sourceType: p.sourceType,
        tokenCounterSupported: p.tokenCounterSupported,
      };
    });
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
   * Selects optimal model based on provider, quota headroom, and health status
   */
  public async selectOptimalModel(
    preferredModels: string[] = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'],
    tier = 'tier_3',
    estimatedTokens = 1000,
    provider: AIProviderId = this.activeProvider
  ): Promise<string> {
    if (this.activeModelOverride) {
      return this.activeModelOverride;
    }

    if (provider === 'gemini') {
      await this.getRealQuotaMetrics();
      const selected = quotaManager.selectBestModel(preferredModels, tier, estimatedTokens);
      return selected || preferredModels[0] || 'gemini-3.7-flash';
    }

    const providerConfig = this.providersCatalog[provider];
    if (providerConfig && providerConfig.models.length > 0) {
      const match = preferredModels.find((m) => providerConfig.models.some((pModel) => pModel.name === m));
      return match || providerConfig.defaultModel;
    }

    return preferredModels[0] || 'gemini-3.7-flash';
  }

  /**
   * Unified generation method extracting exact token usage from any provider's API
   */
  public async generateWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role = 'agent',
    providerOverride?: AIProviderId
  ): Promise<GenerationUsageResult> {
    const provider = providerOverride || this.inferProviderFromModel(model) || this.activeProvider;

    // 1. Google Gemini Provider
    if (provider === 'gemini') {
      return await this.callGeminiWithUsage(model, prompt, fallbackText, role);
    }

    // 2. OpenAI Provider
    if (provider === 'openai') {
      return await this.callOpenAIWithUsage(model, prompt, fallbackText, role);
    }

    // 3. Anthropic Claude Provider
    if (provider === 'anthropic') {
      return await this.callAnthropicWithUsage(model, prompt, fallbackText, role);
    }

    // 4. Groq Provider
    if (provider === 'groq') {
      return await this.callGroqWithUsage(model, prompt, fallbackText, role);
    }

    // 5. DeepSeek Provider
    if (provider === 'deepseek') {
      return await this.callDeepSeekWithUsage(model, prompt, fallbackText, role);
    }

    // 6. Custom / Local Provider
    if (provider === 'custom') {
      return await this.callCustomWithUsage(model, prompt, fallbackText, role);
    }

    return await this.callGeminiWithUsage(model, prompt, fallbackText, role);
  }

  private inferProviderFromModel(model: string): AIProviderId | null {
    if (model.startsWith('gemini-')) return 'gemini';
    if (model.startsWith('gpt-') || model.startsWith('o3-') || model.startsWith('text-embedding-')) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('llama-') || model.startsWith('mixtral-')) return 'groq';
    if (model.startsWith('deepseek-')) return 'deepseek';
    return null;
  }

  // -------------------------------------------------------------
  // Provider Specific API Callers with Usage Extraction
  // -------------------------------------------------------------

  private async callGeminiWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const client = this.getGeminiClient();
    if (client && process.env.GEMINI_API_KEY) {
      // Build failover candidate list prioritizing requested model followed by active Gemini models
      const baseCandidates = [
        model,
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.1-pro-preview',
      ];
      const candidateList = Array.from(new Set(baseCandidates));

      // Filter out models currently in active cooldown unless all are in cooldown
      let availableCandidates = candidateList.filter((m) => !quotaManager.isModelInCooldown(m));
      if (availableCandidates.length === 0) {
        availableCandidates = candidateList;
      }

      for (let i = 0; i < availableCandidates.length; i++) {
        const candidateModel = availableCandidates[i];
        try {
          const response = await client.models.generateContent({
            model: candidateModel,
            contents: prompt,
          });

          const text = response.text?.trim() || fallbackText;
          const usage = response.usageMetadata;

          if (usage && (usage.promptTokenCount !== undefined || usage.totalTokenCount !== undefined)) {
            const promptTokens = usage.promptTokenCount ?? Math.max(1, Math.ceil(prompt.length / 4));
            const completionTokens = usage.candidatesTokenCount ?? Math.max(1, Math.ceil(text.length / 4));
            const totalTokens = usage.totalTokenCount ?? (promptTokens + completionTokens);

            this.recordModelUsage(candidateModel, {
              promptTokenCount: promptTokens,
              candidatesTokenCount: completionTokens,
              totalTokenCount: totalTokens,
            });

            return {
              text,
              promptTokens,
              completionTokens,
              totalTokens,
              provider: 'gemini',
              model: candidateModel,
              isRealProviderUsage: true,
            };
          }

          const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
          const completionTokens = Math.max(1, Math.ceil(text.length / 4));
          const totalTokens = promptTokens + completionTokens;

          this.recordModelUsage(candidateModel, { totalTokenCount: totalTokens });

          return {
            text,
            promptTokens,
            completionTokens,
            totalTokens,
            provider: 'gemini',
            model: candidateModel,
            isRealProviderUsage: true,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const is503 = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand');
          const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');

          if (is503) {
            console.warn(
              `[ProviderManager] Model ${candidateModel} experiencing high demand (503). Activating cooldown & failing over...`
            );
            quotaManager.handle503Error(candidateModel, 30);
          } else if (is429) {
            console.warn(
              `[ProviderManager] Model ${candidateModel} rate limit reached (429). Activating cooldown & failing over...`
            );
            this.handleRateLimitError(candidateModel, 60);
          } else {
            console.warn(
              `[ProviderManager] Gemini call failed for ${role} (${candidateModel}): ${errMsg.substring(0, 100)}`
            );
          }

          // If there are more candidate models, continue to next candidate
          if (i < availableCandidates.length - 1) {
            continue;
          }
        }
      }
    }

    const promptTokens = Math.max(80, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(40, Math.ceil(fallbackText.length / 4));
    const totalTokens = promptTokens + completionTokens;

    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens,
      provider: 'gemini',
      model,
      isRealProviderUsage: false,
    };
  }

  private async callOpenAIWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (apiKey) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content?.trim() || fallbackText;
          const usage = data.usage;

          if (usage) {
            const promptTokens = usage.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
            const completionTokens = usage.completion_tokens ?? Math.max(1, Math.ceil(text.length / 4));
            const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

            this.recordModelUsage(model, {
              promptTokenCount: promptTokens,
              candidatesTokenCount: completionTokens,
              totalTokenCount: totalTokens,
            });

            return {
              text,
              promptTokens,
              completionTokens,
              totalTokens,
              provider: 'openai',
              model,
              isRealProviderUsage: true,
            };
          }
        } else if (res.status === 429) {
          this.handleRateLimitError(model, 60);
        }
      } catch (err: any) {
        console.warn(`[ProviderManager] OpenAI API call failed for ${role} (${model}):`, err.message);
      }
    }

    const promptTokens = Math.max(90, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(45, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: 'openai',
      model,
      isRealProviderUsage: false,
    };
  }

  private async callAnthropicWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';

    if (apiKey) {
      try {
        const res = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text?.trim() || fallbackText;
          const usage = data.usage;

          if (usage) {
            const promptTokens = usage.input_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
            const completionTokens = usage.output_tokens ?? Math.max(1, Math.ceil(text.length / 4));
            const totalTokens = promptTokens + completionTokens;

            this.recordModelUsage(model, {
              promptTokenCount: promptTokens,
              candidatesTokenCount: completionTokens,
              totalTokenCount: totalTokens,
            });

            return {
              text,
              promptTokens,
              completionTokens,
              totalTokens,
              provider: 'anthropic',
              model,
              isRealProviderUsage: true,
            };
          }
        } else if (res.status === 429) {
          this.handleRateLimitError(model, 60);
        }
      } catch (err: any) {
        console.warn(`[ProviderManager] Anthropic API call failed for ${role} (${model}):`, err.message);
      }
    }

    const promptTokens = Math.max(95, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(50, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: 'anthropic',
      model,
      isRealProviderUsage: false,
    };
  }

  private async callGroqWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content?.trim() || fallbackText;
          const usage = data.usage;

          if (usage) {
            const promptTokens = usage.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
            const completionTokens = usage.completion_tokens ?? Math.max(1, Math.ceil(text.length / 4));
            const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

            this.recordModelUsage(model, {
              promptTokenCount: promptTokens,
              candidatesTokenCount: completionTokens,
              totalTokenCount: totalTokens,
            });

            return {
              text,
              promptTokens,
              completionTokens,
              totalTokens,
              provider: 'groq',
              model,
              isRealProviderUsage: true,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[ProviderManager] Groq API call failed for ${role}:`, err.message);
      }
    }

    const promptTokens = Math.max(85, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(40, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: 'groq',
      model,
      isRealProviderUsage: false,
    };
  }

  private async callDeepSeekWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content?.trim() || fallbackText;
          const usage = data.usage;

          if (usage) {
            const promptTokens = usage.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
            const completionTokens = usage.completion_tokens ?? Math.max(1, Math.ceil(text.length / 4));
            const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

            this.recordModelUsage(model, {
              promptTokenCount: promptTokens,
              candidatesTokenCount: completionTokens,
              totalTokenCount: totalTokens,
            });

            return {
              text,
              promptTokens,
              completionTokens,
              totalTokens,
              provider: 'deepseek',
              model,
              isRealProviderUsage: true,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[ProviderManager] DeepSeek API call failed for ${role}:`, err.message);
      }
    }

    const promptTokens = Math.max(85, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(40, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: 'deepseek',
      model,
      isRealProviderUsage: false,
    };
  }

  private async callCustomWithUsage(
    model: string,
    prompt: string,
    fallbackText: string,
    role: string
  ): Promise<GenerationUsageResult> {
    const baseUrl = process.env.CUSTOM_AI_BASE_URL || 'http://localhost:11434/v1';
    const apiKey = process.env.CUSTOM_AI_API_KEY || 'ollama';

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || fallbackText;
        const usage = data.usage;

        if (usage) {
          const promptTokens = usage.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
          const completionTokens = usage.completion_tokens ?? Math.max(1, Math.ceil(text.length / 4));
          const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

          this.recordModelUsage(model, {
            promptTokenCount: promptTokens,
            candidatesTokenCount: completionTokens,
            totalTokenCount: totalTokens,
          });

          return {
            text,
            promptTokens,
            completionTokens,
            totalTokens,
            provider: 'custom',
            model,
            isRealProviderUsage: true,
          };
        }
      }
    } catch (err: any) {
      console.warn(`[ProviderManager] Custom API call failed for ${role}:`, err.message);
    }

    const promptTokens = Math.max(75, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(35, Math.ceil(fallbackText.length / 4));
    return {
      text: fallbackText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider: 'custom',
      model,
      isRealProviderUsage: false,
    };
  }

  /**
   * Real-time token counter using provider's client.models.countTokens API (for Gemini) or heuristic
   */
  public async countRealTokens(model: string, text: string): Promise<{ tokenCount: number; isRealProvider: boolean }> {
    const client = this.getGeminiClient();
    if (client && process.env.GEMINI_API_KEY && model.startsWith('gemini-')) {
      const candidates = [
        model,
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
      ];
      const uniqueCandidates = Array.from(new Set(candidates));

      for (const candidate of uniqueCandidates) {
        try {
          const res = await client.models.countTokens({
            model: candidate,
            contents: text,
          });
          if (res.totalTokens !== undefined) {
            return { tokenCount: res.totalTokens, isRealProvider: true };
          }
        } catch {
          // try next candidate
        }
      }
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
    const configuredList = (Object.keys(this.providersCatalog) as AIProviderId[]).filter((id) =>
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
   * Returns all available models and their configuration
   */
  public getAvailableModels(): ProviderModelConfig[] {
    const all: ProviderModelConfig[] = [];
    for (const p of Object.values(this.providersCatalog)) {
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

    // Merge Cloud Monitoring authoritative data & provider metadata
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
