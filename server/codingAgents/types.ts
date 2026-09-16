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

export type ExecutionStatus = 'FAILED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export function deriveExecutionStatus(status?: string, hasError?: boolean): ExecutionStatus {
  if (status === 'CANCELLED') {
    return 'CANCELLED';
  }
  if (hasError || status === 'FAILED') {
    return 'FAILED';
  }
  if (status === 'COMPLETED') {
    return 'COMPLETED';
  }
  // QUEUED, PLANNING, AWAITING_PLAN_APPROVAL, IN_PROGRESS, PAUSED, etc.
  return 'RUNNING';
}

export const TERMINAL_STATES: ReadonlySet<string> = new Set(['FAILED', 'COMPLETED', 'CANCELLED']);

export function isTerminalState(state?: string): boolean {
  if (!state) return false;
  return TERMINAL_STATES.has(state);
}

/**
 * Validates state transitions according to the strict state machine:
 *   QUEUED -> PLANNING -> IN_PROGRESS -> COMPLETED
 *   From non-terminal states -> FAILED or CANCELLED
 *   Terminal states (FAILED, COMPLETED, CANCELLED) are IRREVERSIBLE:
 *   FAILED -> FAILED only
 *   COMPLETED -> COMPLETED only
 *   CANCELLED -> CANCELLED only
 */
export function isValidStateTransition(current?: string, next?: string): boolean {
  if (!next) return false;
  if (!current || current === next) return true;

  // Terminal states are strictly irreversible
  if (isTerminalState(current)) {
    return false;
  }

  // Any non-terminal state can transition to FAILED or CANCELLED
  if (next === 'FAILED' || next === 'CANCELLED') {
    return true;
  }

  // Strict non-terminal progression
  switch (current) {
    case 'QUEUED':
      return ['PLANNING', 'IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'PAUSED', 'COMPLETED'].includes(next);
    case 'PLANNING':
      return ['IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'PAUSED', 'COMPLETED'].includes(next);
    case 'AWAITING_PLAN_APPROVAL':
      return ['IN_PROGRESS', 'PLANNING', 'PAUSED', 'COMPLETED'].includes(next);
    case 'IN_PROGRESS':
      return ['COMPLETED', 'PAUSED', 'AWAITING_PLAN_APPROVAL'].includes(next);
    case 'PAUSED':
      return ['IN_PROGRESS', 'PLANNING', 'AWAITING_PLAN_APPROVAL'].includes(next);
    default:
      return true;
  }
}

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
  workflowState?: any;
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
  automationMode?: JulesAutomationMode;
  requirePlanApproval?: boolean;
  timeoutSeconds?: number;
  pollIntervalSeconds?: number;
  createRepository?: boolean;
  repositoryName?: string;
  private?: boolean;
  commitAndPush?: boolean;
  commitPushAndCreatePR?: boolean;
  testCommand?: string;
  testsPassed?: boolean;
  reviewExecuted?: boolean;
  reviewApproved?: boolean;
  git?: {
    commit?: boolean;
    push?: boolean;
    createPullRequest?: boolean;
    runTests?: boolean;
  };
}

export interface CodingAgentResult {
  success?: boolean;
  executionStatus?: ExecutionStatus;
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
  commitSha?: string;
  commitUrl?: string;
  pullRequestUrl?: string;
  testsPassed?: boolean;
  reviewExecuted?: boolean;
  reviewApproved?: boolean;
  git?: {
    committed: boolean;
    pushed: boolean;
    branch: string;
    commitSha?: string;
    commitUrl?: string;
    pullRequestUrl?: string;
    filesChanged?: string[];
  };
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

export type WorkflowStage =
  | 'INITIALIZING'
  | 'JULES_RUNNING'
  | 'GITHUB_DELIVERY'
  | 'TESTING'
  | 'REVIEW'
  | 'CORRECTION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'AWAITING_PLAN_APPROVAL';

export interface WorkflowOptions {
  workflowId?: string;
  sessionId?: string;
  taskId?: string;
  taskPrompt: string;
  repository: string;
  branch?: string;
  agent?: string; // 'jules' | 'mock'
  automationMode?: JulesAutomationMode;
  requirePlanApproval?: boolean;
  title?: string;
  createRepository?: boolean;
  repositoryName?: string;
  private?: boolean;
  git?: {
    commit?: boolean;
    push?: boolean;
    createPullRequest?: boolean;
    runTests?: boolean;
    branch?: string;
    commitMessage?: string;
    pullRequestTitle?: string;
    pullRequestBody?: string;
  };
  commitAndPush?: boolean;
  commitPushAndCreatePR?: boolean;
  testCommand?: string;
  tier?: string;
  model?: string;
  provider?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export interface WorkflowState {
  workflowId: string;
  sessionId: string;
  agentId: string;
  repository: string;
  branch: string;
  task: string;
  title?: string;
  stage: WorkflowStage;
  status: JulesSessionState;
  executionStatus: ExecutionStatus;
  options: WorkflowOptions;
  createdAt: string;
  updatedAt: string;
  lastPolledAt?: string;
  pollCount?: number;
  prUrl?: string;
  gitBranch?: string;
  commitSha?: string;
  commitUrl?: string;
  pullRequestUrl?: string;
  testsPassed?: boolean;
  reviewExecuted?: boolean;
  reviewApproved?: boolean;
  git?: any;
  steps: any[];
  finalReport?: any;
  error?: string;
  summary?: string;
  downstreamExecuted?: boolean;
  downstreamExecuting?: boolean;
}

