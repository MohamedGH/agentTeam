import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  JulesActivity,
  JulesSession,
  JulesSource,
} from './types';

/**
 * ICodingAgent
 * 
 * Contract for autonomous cloud/remote coding agents (like Google Jules).
 * Completely distinct from IAIProvider (which manages prompt/token completions).
 */
export interface ICodingAgent {
  readonly id: string;
  readonly name: string;

  /** Check whether required API credentials (e.g. JULES_API_KEY) are configured */
  isConfigured(): boolean;

  /** Metadata and capabilities descriptor */
  getInfo(): CodingAgentInfo;

  /** Create/start an asynchronous coding session (non-blocking) */
  createSession(task: CodingAgentTask): Promise<JulesSession>;
  startSession(task: CodingAgentTask): Promise<JulesSession>;

  /** Retrieve current session status */
  getSession(sessionId: string): Promise<JulesSession>;

  /** Retrieve activities / execution log for a given session, with optional incremental filtering */
  listActivities(
    sessionId: string,
    options?: { lastActivityTime?: string; pageSize?: number }
  ): Promise<JulesActivity[]>;

  /** Send a message/prompt to an ongoing session */
  sendMessage(sessionId: string, message: string): Promise<void>;

  /** Approve the plan for a session that requires plan approval */
  approvePlan(sessionId: string): Promise<void>;

  /** List available GitHub sources connected to this agent */
  listSources?(): Promise<JulesSource[]>;

  /** Execute a task end-to-end with optional progress reporting */
  executeTask(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult>;
}
