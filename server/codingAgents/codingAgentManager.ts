import { ICodingAgent } from './codingAgent';
import { JulesAgent } from './julesAgent';
import { MockCodingAgent } from './mockCodingAgent';
import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  JulesActivity,
  JulesSession,
  JulesSource,
} from './types';

/**
 * CodingAgentManager
 * 
 * Central registry and orchestrator for Autonomous Coding Agents (such as Google Jules).
 * 
 * Strict architectural separation:
 * - ProviderManager = LLM token/completion providers (Gemini, OpenAI, Anthropic, Groq, DeepSeek)
 * - CodingAgentManager = Cloud-hosted repository coding agents (Google Jules)
 */
export class CodingAgentManager {
  private agents: Map<string, ICodingAgent> = new Map();
  private defaultAgentId: string = 'jules';

  constructor() {
    this.registerAgent(new JulesAgent());
    this.registerAgent(new MockCodingAgent());
  }

  public registerAgent(agent: ICodingAgent): void {
    this.agents.set(agent.id, agent);
  }

  public getAgent(id: string): ICodingAgent {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(
        `Coding agent "${id}" is not registered. Available agents: ${Array.from(this.agents.keys()).join(', ')}`
      );
    }
    return agent;
  }

  public getJules(): JulesAgent {
    return this.getAgent('jules') as JulesAgent;
  }

  public listAgents(): CodingAgentInfo[] {
    return Array.from(this.agents.values()).map((a) => a.getInfo());
  }

  public isAgentConfigured(id: string): boolean {
    const agent = this.agents.get(id);
    return agent ? agent.isConfigured() : false;
  }

  /**
   * Main entry point to execute an autonomous coding task.
   * 
   * Example:
   * await codingAgentManager.execute({
   *   agent: "jules",
   *   repository: "MohamedGH/agentTeam",
   *   branch: "main",
   *   task: "Fix the DeepSeek provider",
   *   automationMode: "AUTO_CREATE_PR"
   * });
   */
  public async execute(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult> {
    const agentId = task.agent || this.defaultAgentId;
    const agent = this.getAgent(agentId);

    console.log(`[CodingAgentManager] Dispatching task to autonomous coding agent "${agentId}":`, {
      repository: task.repository,
      branch: task.branch || 'main',
      task: task.task.slice(0, 80),
      automationMode: task.automationMode || 'AUTOMATION_MODE_UNSPECIFIED',
    });

    return agent.executeTask(task, onProgress);
  }

  /**
   * Retrieve session status
   */
  public async getSession(sessionId: string, agentId = 'jules'): Promise<JulesSession> {
    const agent = this.getAgent(agentId);
    return agent.getSession(sessionId);
  }

  /**
   * Retrieve session activities
   */
  public async listActivities(sessionId: string, agentId = 'jules'): Promise<JulesActivity[]> {
    const agent = this.getAgent(agentId);
    return agent.listActivities(sessionId);
  }

  /**
   * List sources connected to an agent (e.g. Jules connected GitHub repos)
   */
  public async listSources(agentId = 'jules'): Promise<JulesSource[]> {
    const agent = this.getAgent(agentId);
    if (agent.listSources) {
      return agent.listSources();
    }
    return [];
  }
}

export const codingAgentManager = new CodingAgentManager();
