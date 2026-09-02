import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from './types';

export class MockProvider implements IAIProvider {
  public readonly id: AIProviderId = 'mock';
  public readonly name = 'Hermetic Mock Provider';
  public readonly defaultModel = 'mock-fast-model';
  public readonly sourceType = 'Hermetic Isolated Testing Engine (Zero Quota)';
  public readonly tokenCounterSupported = true;

  public shouldSimulateError: '429' | '503' | 'network' | null = null;
  public mockTextOverride: string | null = null;

  public readonly models: ProviderModelConfig[] = [
    { name: 'mock-fast-model', displayName: 'Mock Fast Model', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'mock' },
    { name: 'mock-pro-model', displayName: 'Mock Pro Model', contextWindow: 200000, supportsTools: true, costTier: 'pro', providerId: 'mock' },
  ];

  public isConfigured(): boolean {
    return true;
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    if (this.shouldSimulateError === '429') {
      throw new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded on mock model');
    }
    if (this.shouldSimulateError === '503') {
      throw new Error('503 UNAVAILABLE: Model is currently experiencing high demand');
    }
    if (this.shouldSimulateError === 'network') {
      throw new Error('Network connection failed');
    }

    const { model, prompt, fallbackText } = options;
    const text = this.mockTextOverride || fallbackText || `Mock generated content for ${prompt.substring(0, 40)}`;

    const promptTokens = Math.max(12, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(24, Math.ceil(text.length / 4));
    const totalTokens = promptTokens + completionTokens;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      provider: 'mock',
      model,
      isRealProviderUsage: true,
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return {
      tokenCount: Math.max(1, Math.ceil(text.length / 4)),
      isRealProvider: true,
    };
  }
}
