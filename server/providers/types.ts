export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'custom' | 'mock';

export interface ProviderModelConfig {
  name: string;
  displayName: string;
  contextWindow: number;
  supportsTools: boolean;
  costTier: 'flash' | 'pro' | 'ultra' | 'custom';
  providerId: AIProviderId;
}

export interface GenerationUsageResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: AIProviderId;
  model: string;
  isRealProviderUsage: boolean;
  failoverHistory?: Array<{ provider: AIProviderId; model: string; error?: string }>;
}

export interface GenerateOptions {
  model: string;
  prompt: string;
  fallbackText: string;
  role?: string;
  systemInstruction?: string;
  temperature?: number;
}

export interface TokenCountResult {
  tokenCount: number;
  isRealProvider: boolean;
}

/**
 * Unified IAIProvider Interface
 * Every AI provider (Gemini, OpenAI, Anthropic, Groq, DeepSeek, Custom/Local, Mock)
 * implements this single contract.
 */
export interface IAIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly defaultModel: string;
  readonly sourceType: string;
  readonly tokenCounterSupported: boolean;
  readonly models: ProviderModelConfig[];

  isConfigured(): boolean;
  generateContent(options: GenerateOptions): Promise<GenerationUsageResult>;
  countTokens(model: string, text: string): Promise<TokenCountResult>;
  getQuotaMetrics?(forceRefresh?: boolean): Promise<any>;
}
