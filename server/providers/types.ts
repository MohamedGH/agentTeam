export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'custom' | 'mock';

export type ProviderErrorReason =
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'HIGH_DEMAND'
  | 'TEMPORARY_UNAVAILABLE'
  | 'MODEL_EXECUTION_ERROR'
  | 'AUTHENTICATION'
  | 'INVALID_REQUEST'
  | 'CONFIGURATION'
  | 'UNKNOWN';

export interface ClassifiedProviderError {
  retryable: boolean;
  reason: ProviderErrorReason;
  retryAfterSeconds?: number;
  statusCode?: number;
  errorCode?: string;
  errorName?: string;
  sanitizedMessage: string;
}

export interface FailoverRecord {
  provider: AIProviderId;
  model: string;
  reason: ProviderErrorReason;
  retryable: boolean;
  error: string;
  timestamp: number;
}

export { classifyProviderError, sanitizeErrorMessage } from './errorClassifier';

export type TokenAccountingType = 'real_provider' | 'mock' | 'fallback_unknown';

export type GenerationOutcome =
  | 'REAL_PROVIDER_SUCCESS'
  | 'DEGRADED_FALLBACK'
  | 'MOCK_SUCCESS'
  | 'TASK_FAILURE';

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
  tokenAccountingType: TokenAccountingType;
  failoverHistory?: FailoverRecord[];
  generationOutcome?: GenerationOutcome;
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
