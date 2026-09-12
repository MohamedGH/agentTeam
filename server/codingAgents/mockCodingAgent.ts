import { ICodingAgent } from './codingAgent';
import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  JulesActivity,
  JulesSession,
  JulesSource,
} from './types';

/**
 * MockCodingAgent
 * 
 * Hermetic mock implementation of ICodingAgent for testing, CI,
 * and sandbox environments without requiring an active JULES_API_KEY.
 */
export class MockCodingAgent implements ICodingAgent {
  public readonly id = 'mock';
  public readonly name = 'Hermetic Mock Coding Agent';
  private sessions: Map<string, JulesSession> = new Map();
  private sessionActivities: Map<string, JulesActivity[]> = new Map();

  public isConfigured(): boolean {
    return true;
  }

  public getInfo(): CodingAgentInfo {
    return {
      id: this.id,
      name: this.name,
      type: 'autonomous_agent',
      configured: true,
      capabilities: {
        gitHubIntegration: true,
        autoPullRequests: true,
        multiStepPlanning: true,
        asyncExecution: true,
      },
      supportedAutomationModes: ['AUTOMATION_MODE_UNSPECIFIED', 'AUTO_CREATE_PR', 'MANUAL'],
      description: 'Hermetic mock coding agent for zero-quota testing and verification.',
    };
  }

  public async listSources(): Promise<JulesSource[]> {
    return [
      {
        name: 'sources/github/MohamedGH/agentTeam',
        displayName: 'MohamedGH/agentTeam',
        githubRepo: {
          owner: 'MohamedGH',
          repo: 'agentTeam',
          defaultBranch: 'main',
          fullName: 'MohamedGH/agentTeam',
        },
      },
    ];
  }

  public async createSession(task: CodingAgentTask): Promise<JulesSession> {
    const sessionId = 'mock_sess_' + Math.random().toString(36).substring(2, 9);
    const branch = task.branch || 'main';
    const isAutoPr = task.automationMode === 'AUTO_CREATE_PR';

    const session: JulesSession = {
      name: `sessions/${sessionId}`,
      id: sessionId,
      prompt: task.task,
      title: task.title || `Task on ${task.repository}`,
      state: 'COMPLETED',
      sourceContext: {
        source: `sources/github/${task.repository}`,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
      automationMode: isAutoPr ? 'AUTO_CREATE_PR' : 'AUTOMATION_MODE_UNSPECIFIED',
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      gitBranch: `jules/patch-${sessionId.slice(-4)}`,
      prUrl: isAutoPr ? `https://github.com/${task.repository}/pull/42` : undefined,
      resultSummary: `Autonomous patch verified. Created branch jules/patch-${sessionId.slice(-4)}${
        isAutoPr ? ` and PR https://github.com/${task.repository}/pull/42` : ''
      }.`,
    };

    const activities: JulesActivity[] = [
      {
        id: `act_${sessionId}_1`,
        originator: 'AGENT',
        actionType: 'PLANNING',
        description: `Analyzed repository ${task.repository} and formulated execution plan.`,
        createTime: new Date().toISOString(),
      },
      {
        id: `act_${sessionId}_2`,
        originator: 'AGENT',
        actionType: 'CODE_MODIFICATION',
        description: `Applied required changes to resolve: "${task.task}".`,
        createTime: new Date().toISOString(),
      },
      {
        id: `act_${sessionId}_3`,
        originator: 'AGENT',
        actionType: 'TEST_RUN',
        description: 'Ran repository automated test suite: 100% tests passing.',
        createTime: new Date().toISOString(),
      },
    ];

    if (isAutoPr) {
      activities.push({
        id: `act_${sessionId}_4`,
        originator: 'AGENT',
        actionType: 'CREATE_PR',
        description: `Created Pull Request: https://github.com/${task.repository}/pull/42`,
        prUrl: `https://github.com/${task.repository}/pull/42`,
        createTime: new Date().toISOString(),
      });
    }

    this.sessions.set(sessionId, session);
    this.sessionActivities.set(sessionId, activities);

    return session;
  }

  /**
   * Start an asynchronous coding session without blocking.
   * Immediately returns the initial session in IN_PROGRESS or AWAITING_PLAN_APPROVAL.
   */
  public async startSession(task: CodingAgentTask): Promise<JulesSession> {
    const sessionId = 'mock_sess_' + Math.random().toString(36).substring(2, 9);
    const branch = task.branch || 'main';
    const isAutoPr = task.automationMode === 'AUTO_CREATE_PR';
    const requiresApproval = Boolean(task.requirePlanApproval);

    const initialState: any = requiresApproval ? 'AWAITING_PLAN_APPROVAL' : 'IN_PROGRESS';

    const session: JulesSession = {
      name: `sessions/${sessionId}`,
      id: sessionId,
      prompt: task.task,
      title: task.title || `Task on ${task.repository}`,
      state: initialState,
      sourceContext: {
        source: `sources/github/${task.repository}`,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
      automationMode: isAutoPr ? 'AUTO_CREATE_PR' : 'AUTOMATION_MODE_UNSPECIFIED',
      requirePlanApproval: requiresApproval,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      gitBranch: `jules/patch-${sessionId.slice(-4)}`,
      prUrl: undefined,
      resultSummary: requiresApproval
        ? 'Formulated execution plan. Awaiting human plan approval.'
        : 'Autonomous coding session running in cloud environment.',
    };

    const activities: JulesActivity[] = [
      {
        id: `act_${sessionId}_1`,
        originator: 'AGENT',
        actionType: 'PLANNING',
        description: `Analyzed repository ${task.repository} on branch ${branch} and formulated multi-step patch plan.`,
        createTime: new Date().toISOString(),
      },
    ];

    if (requiresApproval) {
      activities.push({
        id: `act_${sessionId}_plan_req`,
        originator: 'SYSTEM',
        actionType: 'PLAN_APPROVAL_REQUIRED',
        description: 'Session is paused awaiting plan approval from operator.',
        createTime: new Date().toISOString(),
      });
    } else {
      activities.push({
        id: `act_${sessionId}_2`,
        originator: 'AGENT',
        actionType: 'CODE_MODIFICATION',
        description: `Applying changes for: "${task.task}".`,
        createTime: new Date().toISOString(),
      });
    }

    this.sessions.set(sessionId, session);
    this.sessionActivities.set(sessionId, activities);

    return session;
  }

  /**
   * Send interactive message or prompt to ongoing session
   */
  public async sendMessage(sessionId: string, message: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const session = this.sessions.get(cleanId);
    if (!session) {
      throw new Error(`Mock session not found: ${cleanId}`);
    }

    const activities = this.sessionActivities.get(cleanId) || [];
    const timestamp = new Date().toISOString();

    activities.push({
      id: `act_${cleanId}_user_${Date.now()}`,
      originator: 'USER',
      actionType: 'USER_MESSAGE',
      description: message,
      createTime: timestamp,
    });

    activities.push({
      id: `act_${cleanId}_agent_reply_${Date.now()}`,
      originator: 'AGENT',
      actionType: 'AGENT_REPLY',
      description: `Acknowledged instruction: "${message.slice(0, 80)}". Updating execution context.`,
      createTime: timestamp,
    });

    this.sessionActivities.set(cleanId, activities);
    session.updateTime = timestamp;
  }

  /**
   * Approve plan for sessions awaiting approval
   */
  public async approvePlan(sessionId: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const session = this.sessions.get(cleanId);
    if (!session) {
      throw new Error(`Mock session not found: ${cleanId}`);
    }

    const activities = this.sessionActivities.get(cleanId) || [];
    const timestamp = new Date().toISOString();

    activities.push({
      id: `act_${cleanId}_approved_${Date.now()}`,
      originator: 'USER',
      actionType: 'PLAN_APPROVED',
      planApproved: true,
      description: 'Plan approved by user. Jules resuming execution.',
      createTime: timestamp,
    });

    activities.push({
      id: `act_${cleanId}_pr_${Date.now()}`,
      originator: 'AGENT',
      actionType: 'CREATE_PR',
      description: `Created Pull Request: https://github.com/MohamedGH/agentTeam/pull/42`,
      prUrl: 'https://github.com/MohamedGH/agentTeam/pull/42',
      createTime: timestamp,
    });

    session.state = 'COMPLETED';
    session.prUrl = 'https://github.com/MohamedGH/agentTeam/pull/42';
    session.resultSummary = `Plan approved and executed. Pull request created: ${session.prUrl}`;
    session.updateTime = timestamp;

    this.sessionActivities.set(cleanId, activities);
  }

  public async getSession(sessionId: string): Promise<JulesSession> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const session = this.sessions.get(cleanId);
    if (!session) {
      throw new Error(`Mock session not found: ${cleanId}`);
    }
    return session;
  }

  public async listActivities(sessionId: string): Promise<JulesActivity[]> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    return this.sessionActivities.get(cleanId) || [];
  }

  public async executeTask(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult> {
    const startMs = Date.now();
    const session = await this.createSession(task);
    const activities = this.sessionActivities.get(session.id) || [];

    for (const act of activities) {
      if (onProgress) {
        onProgress(act);
      }
    }

    return {
      agentId: this.id,
      sessionId: session.id,
      status: session.state,
      repository: task.repository,
      branch: task.branch || 'main',
      title: session.title,
      prompt: task.task,
      prUrl: session.prUrl,
      gitBranch: session.gitBranch,
      summary: session.resultSummary || 'Task completed successfully',
      activities,
      rawSession: session,
      durationMs: Date.now() - startMs,
    };
  }
}
