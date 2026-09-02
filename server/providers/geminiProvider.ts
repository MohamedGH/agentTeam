import { GoogleGenAI } from '@google/genai';
import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from './types';
import { cloudMonitoringQuotaService } from '../cloudMonitoring';

export class GeminiProvider implements IAIProvider {
  public readonly id: AIProviderId = 'gemini';
  public readonly name = 'Google Gemini';
  public readonly defaultModel = 'gemini-3.7-flash';
  public readonly sourceType = 'Google Cloud Monitoring & Gemini SDK';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    { name: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', contextWindow: 2097152, supportsTools: true, costTier: 'pro', providerId: 'gemini' },
    { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', contextWindow: 1048576, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
  ];

  private client: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  public getClient(): GoogleGenAI | null {
    if (!this.client && process.env.GEMINI_API_KEY) {
      this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.client;
  }

  public isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const client = this.getClient();
    if (!client || !process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured');
    }

    const { model, prompt, fallbackText } = options;
    const response = await client.models.generateContent({
      model,
      contents: prompt,
    });

    const text = response.text?.trim() || fallbackText;
    const usage = response.usageMetadata;

    const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(prompt.length / 4));
    const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(text.length / 4));
    const totalTokens = usage?.totalTokenCount ?? (promptTokens + completionTokens);

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      provider: 'gemini',
      model,
      isRealProviderUsage: Boolean(usage && (usage.promptTokenCount !== undefined || usage.totalTokenCount !== undefined)),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    const client = this.getClient();
    if (client && process.env.GEMINI_API_KEY) {
      try {
        const res = await client.models.countTokens({
          model,
          contents: text,
        });
        if (res.totalTokens !== undefined) {
          return { tokenCount: res.totalTokens, isRealProvider: true };
        }
      } catch {
        // Fall through to heuristic if API token count call fails
      }
    }
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }

  public async getQuotaMetrics(forceRefresh = false): Promise<any> {
    return await cloudMonitoringQuotaService.fetchRealQuotaMetrics(forceRefresh);
  }
}
