/**
 * Types & Interfaces for Google Jules & Autonomous Coding Agents
 */

export type JulesSessionState =
  | 'STATE_UNSPECIFIED'
  | 'QUEUED'
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'AWAITING_PLAN_APPROVAL'
  | 'PAUSED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED'
  | string;

export type JulesAutomationMode =
  | 'AUTOMATION_MODE_UNSPECIFIED'
  | 'AUTO_CREATE_PR'
  | 'MANUAL';

export interface JulesGitHubRepoContext {
  startingBranch: string;
}

export interface JulesSourceContext {
  source: string; // e.g. "sources/github/owner/repo" or "sources/github-owner-repo"
  githubRepoContext?: JulesGitHubRepoContext;
}

export interface JulesGitHubRepoInfo {
  owner: string;
  repo: string;
  defaultBranch?: string;
  fullName?: string;
}

export interface JulesSource {
  name: string; // "sources/github/owner/repo"
  displayName?: string;
  githubRepo?: JulesGitHubRepoInfo;
}

export interface JulesActivity {
  name?: string;
  id?: string;
  originator?: 'USER' | 'AGENT' | 'SYSTEM' | string;
  description?: string;
  createTime?: string;
  planApproved?: boolean;
  output?: string;
  prUrl?: string;
  gitBranch?: string;
  actionType?: string;
}

export interface JulesSession {
  name: string; // "sessions/<sessionId>"
  id: string;
  prompt: string;
  title?: string;
  state: JulesSessionState;
  sourceContext: JulesSourceContext;
  automationMode?: JulesAutomationMode;
  requirePlanApproval?: boolean;
  createTime?: string;
  updateTime?: string;
  prUrl?: string;
  gitBranch?: string;
  resultSummary?: string;
}

export interface CreateJulesSessionRequest {
  prompt: string;
  title?: string;
  sourceContext: JulesSourceContext;
  automationMode?: JulesAutomationMode;
  requirePlanApproval?: boolean;
}

export interface CodingAgentTask {
  agent?: string; // "jules" | "mock"
  repository: string; // e.g. "MohamedGH/agentTeam" or "owner/repo"
  branch?: string; // e.g. "main"
  task: string; // task prompt/instructions
  title?: string;
  automationMode?: 'AUTO_CREATE_PR' | 'MANUAL';
  requirePlanApproval?: boolean;
  timeoutSeconds?: number;
  pollIntervalSeconds?: number;
}

export interface CodingAgentResult {
  agentId: string;
  sessionId: string;
  status: JulesSessionState;
  repository: string;
  branch: string;
  title?: string;
  prompt: string;
  prUrl?: string;
  gitBranch?: string;
  summary: string;
  activities: JulesActivity[];
  rawSession?: any;
  durationMs: number;
  error?: string;
}

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
  supportedAutomationModes: JulesAutomationMode[];
  description: string;
}
