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

export type TokenAccountingType = 'real_provider' | 'mock' | 'fallback_unknown';

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
  tokenAccountingType?: TokenAccountingType;
}

export interface FinalReport {
  implementation: 'PASS' | 'FAIL';
  tests: 'PASS' | 'FAIL' | 'SKIPPED';
  review: 'APPROVED' | 'CHANGES_REQUIRED' | 'SKIPPED';
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
    codingAgentUsed?: string;
    error?: string;
    prUrl?: string;
    gitBranch?: string;
    commitSha?: string;
    commitUrl?: string;
    pullRequestUrl?: string;
    testsPassed?: boolean;
    git?: {
      committed?: boolean;
      pushed?: boolean;
      branch?: string;
      commitSha?: string;
      commitUrl?: string;
      pullRequestUrl?: string;
      filesChanged?: string[];
    };
    estimatedTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    isRealTokenUsage?: boolean;
    tokenAccountingType?: TokenAccountingType;
  };
}

export interface TeamRunResult {
  taskId: string;
  taskPrompt: string;
  success: boolean;
  modelUsed: string;
  codingAgentUsed?: string;
  prUrl?: string;
  gitBranch?: string;
  commitSha?: string;
  commitUrl?: string;
  pullRequestUrl?: string;
  testsPassed?: boolean;
  git?: {
    committed?: boolean;
    pushed?: boolean;
    branch?: string;
    commitSha?: string;
    commitUrl?: string;
    pullRequestUrl?: string;
    filesChanged?: string[];
  };
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
  isAuthoritative?: boolean;
  quotaSource?: 'google_cloud_monitoring' | 'google_service_usage' | 'offline_fallback' | 'unmetered';
  quotaSourceLabel?: string;
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
  cloudTpmLimit?: number;
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

// Autonomous Coding Agent (Google Jules) Types
export type CodingAgentId = 'jules' | 'mock';

export interface CodingAgentInfo {
  id: string;
  name: string;
  type: 'autonomous_agent';
  configured: boolean;
  capabilities: {
    gitHubIntegration: boolean;
    autoPullRequests: boolean;
    multiStepPlanning: boolean;
    asyncExecution: boolean;
  };
  supportedAutomationModes: string[];
  description: string;
}

export interface JulesActivity {
  name?: string;
  id?: string;
  originator?: string;
  description?: string;
  createTime?: string;
  planApproved?: boolean;
  output?: string;
  prUrl?: string;
  gitBranch?: string;
  actionType?: string;
}

export type JulesSessionState =
  | 'SESSION_STATE_UNSPECIFIED'
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export interface JulesSession {
  name?: string;
  id: string;
  prompt?: string;
  title?: string;
  state: JulesSessionState;
  createTime?: string;
  updateTime?: string;
  sourceContext?: {
    source: string;
    branch?: string;
  };
  prUrl?: string;
  gitBranch?: string;
  resultSummary?: string;
}

export interface CodingAgentTask {
  agent?: string;
  repository: string;
  branch?: string;
  task: string;
  title?: string;
  automationMode?: 'AUTO_CREATE_PR' | 'MANUAL';
  requirePlanApproval?: boolean;
}

export interface CodingAgentResult {
  agentId: string;
  sessionId: string;
  status: string;
  repository: string;
  branch: string;
  title?: string;
  prompt: string;
  prUrl?: string;
  gitBranch?: string;
  summary: string;
  activities: JulesActivity[];
  durationMs: number;
  error?: string;
}
