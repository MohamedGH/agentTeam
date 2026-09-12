import { ICodingAgent } from './codingAgent';
import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  JulesActivity,
  JulesSession,
  JulesSessionState,
  JulesSource,
} from './types';

export interface MockTimelineStep {
  elapsedSeconds: number;
  state: JulesSessionState;
  description?: string;
  prUrl?: string;
  actionType?: string;
}

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
  private simulatedTimelines: Map<string, MockTimelineStep[]> = new Map();
  private simulatedElapsedSeconds: Map<string, number> = new Map();

  public isConfigured(): boolean {
    return true;
  }

  /** Allow hermetic test suites to inject pre-existing sessions */
  public registerSession(session: JulesSession, activities: JulesActivity[] = []): void {
    const cleanId = session.id.replace(/^sessions\//, '');
    this.sessions.set(cleanId, session);
    this.sessionActivities.set(cleanId, activities);
  }

  /** Configure timeline steps for test simulation */
  public setSimulatedTimeline(sessionId: string, timeline: MockTimelineStep[]): void {
    const cleanId = sessionId.replace(/^sessions\//, '');
    this.simulatedTimelines.set(
      cleanId,
      [...timeline].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds)
    );
    if (!this.simulatedElapsedSeconds.has(cleanId)) {
      this.simulatedElapsedSeconds.set(cleanId, 0);
    }
  }

  /** Advance virtual time for testing asynchronous transitions */
  public advanceSimulatedTime(sessionId: string, seconds: number): JulesSessionState {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const current = this.simulatedElapsedSeconds.get(cleanId) || 0;
    return this.setSimulatedElapsedSeconds(cleanId, current + seconds);
  }

  /** Set exact virtual elapsed seconds for a session */
  public setSimulatedElapsedSeconds(sessionId: string, elapsedSeconds: number): JulesSessionState {
    const cleanId = sessionId.replace(/^sessions\//, '');
    this.simulatedElapsedSeconds.set(cleanId, elapsedSeconds);

    const session = this.sessions.get(cleanId);
    const timeline = this.simulatedTimelines.get(cleanId);

    if (session && timeline && timeline.length > 0) {
      let matchedStep = timeline[0];
      for (const step of timeline) {
        if (step.elapsedSeconds <= elapsedSeconds) {
          matchedStep = step;
        }
      }

      session.state = matchedStep.state;
      if (matchedStep.prUrl) {
        session.prUrl = matchedStep.prUrl;
      }
      if (matchedStep.description) {
        session.resultSummary = matchedStep.description;
        const activities = this.sessionActivities.get(cleanId) || [];
        const actId = `act_${cleanId}_t${matchedStep.elapsedSeconds}`;
        if (!activities.some((a) => a.id === actId)) {
          activities.push({
            id: actId,
            originator: 'AGENT',
            actionType: matchedStep.actionType || 'UPDATE',
            description: matchedStep.description,
            prUrl: matchedStep.prUrl,
            createTime: new Date(Date.now() + matchedStep.elapsedSeconds * 1000).toISOString(),
          });
          this.sessionActivities.set(cleanId, activities);
        }
      }
      return matchedStep.state;
    }

    return session ? session.state : 'QUEUED';
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
   * Immediately returns the initial session in QUEUED (or AWAITING_PLAN_APPROVAL).
   */
  public async startSession(task: CodingAgentTask): Promise<JulesSession> {
    const sessionId = 'mock_sess_' + Math.random().toString(36).substring(2, 9);
    const branch = task.branch || 'main';
    const isAutoPr = task.automationMode === 'AUTO_CREATE_PR';
    const requiresApproval = Boolean(task.requirePlanApproval);

    const isFailureTrigger = task.task.includes('TASK_TRIGGER_FAILURE');
    const failureReason = isFailureTrigger
      ? task.task.split('TASK_TRIGGER_FAILURE:')[1]?.trim() || 'Simulated task execution failure'
      : undefined;

    const initialState: any = isFailureTrigger
      ? 'FAILED'
      : requiresApproval
      ? 'AWAITING_PLAN_APPROVAL'
      : 'QUEUED';

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
      resultSummary: isFailureTrigger
        ? failureReason
        : requiresApproval
        ? 'Formulated execution plan. Awaiting human plan approval.'
        : 'Session queued and ready for autonomous cloud execution.',
    };

    const activities: JulesActivity[] = [
      {
        id: `act_${sessionId}_1`,
        originator: 'AGENT',
        actionType: 'PLANNING',
        description: `Session initialized on ${task.repository} (branch: ${branch}).`,
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

    if (session.state === 'COMPLETED' || session.state === 'FAILED' || session.state === 'CANCELLED') {
      throw new Error(`Cannot send message to session in terminal state ${session.state}: session ${cleanId} is finished.`);
    }

    const activities = this.sessionActivities.get(cleanId) || [];
    let timestamp = new Date().toISOString();
    const lastAct = activities[activities.length - 1];
    if (lastAct?.createTime && new Date(lastAct.createTime).getTime() >= Date.now()) {
      timestamp = new Date(new Date(lastAct.createTime).getTime() + 10).toISOString();
    }

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
      createTime: new Date(new Date(timestamp).getTime() + 5).toISOString(),
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

    if (session.state === 'COMPLETED' || session.state === 'FAILED' || session.state === 'CANCELLED') {
      throw new Error(`Cannot approve plan for session in terminal state ${session.state}: session ${cleanId} is finished.`);
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

    // If a timeline is registered, sync session state with virtual elapsed time
    if (this.simulatedTimelines.has(cleanId)) {
      const elapsed = this.simulatedElapsedSeconds.get(cleanId) || 0;
      this.setSimulatedElapsedSeconds(cleanId, elapsed);
    }

    return session;
  }

  public async listActivities(
    sessionId: string,
    options?: { lastActivityTime?: string; pageSize?: number }
  ): Promise<JulesActivity[]> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const activities = this.sessionActivities.get(cleanId) || [];

    if (options?.lastActivityTime) {
      const since = new Date(options.lastActivityTime).getTime();
      return activities.filter((a) => {
        if (!a.createTime) return true;
        return new Date(a.createTime).getTime() > since;
      });
    }

    return activities;
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
