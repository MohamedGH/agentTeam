export type AgentRole = 'manager' | 'developer' | 'tester' | 'reviewer';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'waiting' | 'pass' | 'fail' | 'approved' | 'changes_required';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  result: string;
  timestamp: number;
}

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'custom';

export interface ProviderInfo {
  id: AIProviderId;
  name: string;
  configured: boolean;
  active: boolean;
  models: {
    name: string;
    displayName: string;
    contextWindow: number;
    costTier: 'flash' | 'pro' | 'ultra' | 'custom';
  }[];
  defaultModel: string;
  sourceType: string;
  tokenCounterSupported: boolean;
}

export interface AgentStep {
  id: string;
  phase: number;
  phaseName: string;
  agent: AgentRole;
  thought: string;
  toolCalls?: ToolCallRecord[];
  status?: string;
  output?: string;
  timestamp: number;
  provider?: AIProviderId | string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  isRealTokenUsage?: boolean;
}

export interface FinalReport {
  implementation: 'PASS' | 'FAIL';
  tests: 'PASS' | 'FAIL';
  review: 'APPROVED' | 'CHANGES_REQUIRED';
  filesChanged: string[];
  testSummary: string;
  reviewSummary: string;
  remainingIssues: string[];
  totalCycles: {
    testerCorrections: number;
    reviewerCorrections: number;
  };
  metrics: {
    durationMs: number;
    modelUsed: string;
    providerUsed?: string;
    estimatedTokens: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    isRealTokenUsage?: boolean;
  };
}

export interface TeamRunResult {
  taskId: string;
  taskPrompt: string;
  success: boolean;
  modelUsed: string;
  steps: AgentStep[];
  finalReport?: FinalReport;
  virtualFiles: Record<string, string>;
  error?: string;
}

export interface QuotaLimit {
  metric?: string;
  displayName?: string;
  rpm?: number;
  tpm?: number;
  rpd?: number;
}

export interface ModelQuotaStatus {
  model: string;
  tier: string;
  rpm_limit?: number;
  rpm_used: number;
  rpm_remaining?: number;
  tpm_limit?: number;
  tpm_used: number;
  tpm_remaining?: number;
  rpd_limit?: number;
  rpd_used: number;
  rpd_remaining?: number;
  errors_429: number;
  blocked: boolean;
  cooloff_until?: number;
  monitoringSource?: string;
  cloudRpmLimit?: number;
  cloudRpdLimit?: number;
  cacheAgeSeconds?: number;
  cacheTtlSeconds?: number;
}

export interface QuotaStateResponse {
  tier: string;
  models: Record<string, ModelQuotaStatus>;
  totalModels: number;
  activeTier: string;
  monitoringSource?: string;
  authenticated?: boolean;
  cacheAgeSeconds?: number;
  cacheTtlSeconds?: number;
}

export interface VirtualFile {
  path: string;
  content: string;
  lastModified: number;
}
