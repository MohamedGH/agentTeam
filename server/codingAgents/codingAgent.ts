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

  /** Create an asynchronous coding session */
  createSession(task: CodingAgentTask): Promise<JulesSession>;

  /** Retrieve current session status */
  getSession(sessionId: string): Promise<JulesSession>;

  /** Retrieve activities / execution log for a given session */
  listActivities(sessionId: string): Promise<JulesActivity[]>;

  /** List available GitHub sources connected to this agent */
  listSources?(): Promise<JulesSource[]>;

  /** Execute a task end-to-end with optional progress reporting */
  executeTask(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult>;
}
