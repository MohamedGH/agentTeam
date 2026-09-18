import { ICodingAgent } from './codingAgent';
import { JulesAgent } from './julesAgent';
import { MockCodingAgent } from './mockCodingAgent';
import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  ExecutionStatus,
  JulesActivity,
  JulesSession,
  JulesSource,
  deriveExecutionStatus,
} from './types';
import {
  ICodingAgentSessionStore,
  FileBackedCodingAgentSessionStore,
  StoredCodingSession,
} from './sessionStore';
import { GitHubManager, githubManager as defaultGitHubManager } from '../github';

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
  private sessionStore: ICodingAgentSessionStore;
  private githubManager: GitHubManager;

  constructor(
    sessionStoreOrOptions?: ICodingAgentSessionStore | {
      sessionStore?: ICodingAgentSessionStore;
      githubManager?: GitHubManager;
      julesAgent?: ICodingAgent;
      mockAgent?: ICodingAgent;
    },
    customGitHubManager?: GitHubManager
  ) {
    if (sessionStoreOrOptions && typeof (sessionStoreOrOptions as any).saveSession !== 'function' && typeof sessionStoreOrOptions === 'object') {
      const opts = sessionStoreOrOptions as {
        sessionStore?: ICodingAgentSessionStore;
        githubManager?: GitHubManager;
        julesAgent?: ICodingAgent;
        mockAgent?: ICodingAgent;
      };
      this.sessionStore = opts.sessionStore || new FileBackedCodingAgentSessionStore();
      this.githubManager = opts.githubManager || customGitHubManager || defaultGitHubManager;
      this.registerAgent(opts.julesAgent || new JulesAgent());
      this.registerAgent(opts.mockAgent || new MockCodingAgent(this.sessionStore));
    } else {
      this.sessionStore = (sessionStoreOrOptions as ICodingAgentSessionStore) || new FileBackedCodingAgentSessionStore();
      this.githubManager = customGitHubManager || defaultGitHubManager;
      this.registerAgent(new JulesAgent());
      this.registerAgent(new MockCodingAgent(this.sessionStore));
    }
  }

  public getSessionStore(): ICodingAgentSessionStore {
    return this.sessionStore;
  }

  public getGitHubManager(): GitHubManager {
    return this.githubManager;
  }

  public setGitHubManager(manager: GitHubManager): void {
    this.githubManager = manager;
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

  public getMock(): MockCodingAgent {
    return this.getAgent('mock') as MockCodingAgent;
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
   * By default, delegates to startSession for immediate asynchronous execution.
   */
  public async execute(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult> {
    const agentId = task.agent || this.defaultAgentId;
    const agent = this.getAgent(agentId);

    console.log(`[CodingAgentManager] Executing task with agent "${agentId}":`, {
      repository: task.repository,
      branch: task.branch || 'main',
      task: task.task.slice(0, 80),
      automationMode: task.automationMode || 'AUTOMATION_MODE_UNSPECIFIED',
    });

    const result = await agent.executeTask(task, onProgress);
    result.executionStatus = result.executionStatus || deriveExecutionStatus(result.status, Boolean(result.error));
    result.success = result.executionStatus === 'COMPLETED' && !result.error;

    // Git / GitHub automation integration
    const gitRequested = Boolean(
      task.git?.commit ||
      task.git?.push ||
      task.git?.createPullRequest ||
      task.commitAndPush ||
      task.commitPushAndCreatePR ||
      task.createRepository
    );

    if (gitRequested) {
      if (result.executionStatus === 'RUNNING') {
        // Jules session is still in flight in the cloud (e.g. QUEUED, PLANNING, IN_PROGRESS).
        // Do NOT push to git or create PR yet, and NEVER treat as failed due to missing GitHub token!
        result.testsPassed = undefined;
        result.success = false;
        // executionStatus remains 'RUNNING'
      } else if (result.executionStatus === 'CANCELLED') {
        // Jules session was cancelled. Do NOT execute git automation or treat as generic FAILED!
        result.testsPassed = undefined;
        result.success = false;
        result.executionStatus = 'CANCELLED';
      } else if (result.executionStatus === 'FAILED') {
        // Critical safety rule: Never automatically push if task or tests failed!
        result.success = false;
        result.testsPassed = false;
        result.error = result.error || result.summary || 'Coding task failed: skipping git push and PR.';
      } else if (!this.githubManager.isConfigured()) {
        result.success = false;
        result.error = 'GITHUB_TOKEN is not configured';
        result.executionStatus = 'FAILED';
      } else if (result.executionStatus === 'COMPLETED' && result.status === 'COMPLETED') {
        const repoTarget = task.repositoryName || task.repository;
        const targetBranch =
          task.branch ||
          result.gitBranch ||
          `jules/task-${result.sessionId?.slice(-6) || Date.now().toString(36)}`;

        const testCmd = task.testCommand || (task.git?.runTests !== false ? 'npm test' : undefined);
        let testsPassed: boolean | undefined = (task as any).testsPassed ?? result.testsPassed;
        if (testCmd && testsPassed === undefined) {
          const testRes = await this.githubManager.getGitOps().runVerificationTests(testCmd);
          testsPassed = testRes.passed;
          if (!testsPassed) {
            result.error = `Automated tests failed:\n${testRes.output}`;
          }
        }

        const reviewApproved: boolean | undefined =
          (task as any).reviewApproved !== undefined
            ? (task as any).reviewApproved
            : (result as any).reviewApproved;

        const reviewExecuted: boolean | undefined =
          (task as any).reviewExecuted !== undefined
            ? (task as any).reviewExecuted
            : (result as any).reviewExecuted;

        const realExecution: boolean =
          (task as any).realExecution !== undefined
            ? Boolean((task as any).realExecution)
            : false;

        const gitRes = await this.githubManager.processTaskResult({
          repository: repoTarget,
          branch: targetBranch,
          baseBranch: 'main',
          taskPrompt: task.task,
          sessionId: result.sessionId,
          sessionStatus: result.status,
          executionStatus: result.executionStatus,
          realExecution,
          testsPassed,
          reviewExecuted,
          reviewApproved,
          createRepository: task.createRepository,
          private: task.private,
          git: task.git,
          commitAndPush: task.commitAndPush,
          commitPushAndCreatePR: task.commitPushAndCreatePR,
          testCommand: testCmd,
          workingDirectory: task.workingDirectory,
        });

        result.testsPassed = gitRes.testsPassed;
        result.reviewExecuted = reviewExecuted;
        result.reviewApproved = reviewApproved;
        result.commitSha = gitRes.commitSha;
        result.commitUrl = gitRes.commitUrl;
        result.pullRequestUrl = gitRes.pullRequestUrl || result.prUrl;
        result.git = gitRes.git;
        result.success = result.status === 'COMPLETED' && gitRes.success && !result.error;

        if (!gitRes.success) {
          result.error = result.error || gitRes.error;
          result.status = 'FAILED';
          result.executionStatus = 'FAILED';
          result.success = false;
        }
      }
    }

    // Save session snapshot into sessionStore
    if (result.sessionId) {
      await this.sessionStore.saveSession({
        sessionId: result.sessionId,
        agentId,
        repository: task.repository,
        branch: task.branch || 'main',
        task: task.task,
        status: result.status,
        createdAt: new Date(Date.now() - (result.durationMs || 0)).toISOString(),
        updatedAt: new Date().toISOString(),
        prUrl: result.prUrl,
        gitBranch: result.gitBranch,
        title: result.title,
        summary: result.summary,
        error: result.error,
        activities: result.activities,
      }).catch((err) => console.warn('[CodingAgentManager] Store save warning:', err.message));
    }

    return result;
  }

  /**
   * Start an autonomous coding session asynchronously without blocking.
   * Returns immediately with the newly created session and persists it in sessionStore.
   */
  public async startSession(task: CodingAgentTask): Promise<JulesSession> {
    const agentId = task.agent || this.defaultAgentId;
    const agent = this.getAgent(agentId);

    console.log(`[CodingAgentManager] Starting async session on agent "${agentId}":`, {
      repository: task.repository,
      branch: task.branch || 'main',
      task: task.task.slice(0, 80),
      automationMode: task.automationMode || 'AUTOMATION_MODE_UNSPECIFIED',
    });

    const session = await agent.startSession(task);

    // Persist immediately to the durable session store
    await this.sessionStore.saveSession({
      sessionId: session.id,
      agentId,
      repository: task.repository,
      branch: task.branch || 'main',
      task: task.task,
      status: session.state,
      createdAt: session.createTime || new Date().toISOString(),
      updatedAt: session.updateTime || new Date().toISOString(),
      prUrl: session.prUrl,
      gitBranch: session.gitBranch,
      title: session.title || task.title,
      summary: session.resultSummary,
    }).catch((err) => console.warn('[CodingAgentManager] Failed to persist session to store:', err.message));

    // Persist initial activities from agent if available
    try {
      const initialActs = await agent.listActivities(session.id);
      if (initialActs && initialActs.length > 0) {
        await this.sessionStore.saveActivities(session.id, initialActs).catch(() => {});
      }
    } catch {}

    return session;
  }

  /**
   * Send an interactive message to an active session.
   * Guards against sending messages to terminal sessions.
   */
  public async sendMessage(sessionId: string, message: string, agentId?: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const stored = await this.sessionStore.getSession(cleanId);
    const resolvedAgentId = agentId || stored?.agentId || (cleanId.startsWith('mock_sess_') ? 'mock' : this.defaultAgentId);
    const agent = this.getAgent(resolvedAgentId);

    await agent.sendMessage(cleanId, message);

    try {
      const updatedActs = await agent.listActivities(cleanId);
      if (updatedActs && updatedActs.length > 0) {
        await this.sessionStore.saveActivities(cleanId, updatedActs).catch(() => {});
      }
    } catch {
      // Append fallback user activity in sessionStore
      const userAct: JulesActivity = {
        id: `act_${cleanId}_user_${Date.now()}`,
        originator: 'USER',
        actionType: 'USER_MESSAGE',
        description: message,
        createTime: new Date().toISOString(),
      };
      await this.sessionStore.saveActivities(cleanId, [userAct]).catch(() => {});
    }
  }

  /**
   * Approve plan for a session awaiting approval
   */
  public async approvePlan(sessionId: string, agentId?: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const stored = await this.sessionStore.getSession(cleanId);
    const resolvedAgentId = agentId || stored?.agentId || (cleanId.startsWith('mock_sess_') ? 'mock' : this.defaultAgentId);
    const agent = this.getAgent(resolvedAgentId);

    await agent.approvePlan(cleanId);

    const approveAct: JulesActivity = {
      id: `act_${cleanId}_apprv_${Date.now()}`,
      originator: 'USER',
      actionType: 'PLAN_APPROVED',
      planApproved: true,
      description: 'Plan approved by operator.',
      createTime: new Date().toISOString(),
    };
    await this.sessionStore.saveActivities(cleanId, [approveAct]).catch(() => {});

    // Refresh and update stored session state
    try {
      const updated = await agent.getSession(cleanId);
      await this.sessionStore.updateSession(cleanId, {
        status: updated.state,
        prUrl: updated.prUrl,
        updatedAt: new Date().toISOString(),
      });
    } catch {}
  }

  /**
   * Retrieve session status on-demand.
   * 
   * Durability across server restarts:
   * If the local agent throws (e.g. process rebooted or network partition),
   * the persistent sessionStore returns the session record intact.
   */
  public async getSession(sessionId: string, agentId?: string): Promise<JulesSession> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const stored = await this.sessionStore.getSession(cleanId);
    const resolvedAgentId = agentId || stored?.agentId || (cleanId.startsWith('mock_sess_') ? 'mock' : this.defaultAgentId);

    try {
      const agent = this.getAgent(resolvedAgentId);
      const liveSession = await agent.getSession(cleanId);

      // Sync latest live status to durable store
      await this.sessionStore.updateSession(cleanId, {
        status: liveSession.state,
        prUrl: liveSession.prUrl,
        gitBranch: liveSession.gitBranch,
        summary: liveSession.resultSummary,
        updatedAt: liveSession.updateTime || new Date().toISOString(),
      }).catch(() => {});

      return liveSession;
    } catch (agentErr: any) {
      // RULE: Live Google Jules errors must NEVER be masked by an old stored COMPLETED state!
      if (resolvedAgentId === 'jules') {
        throw agentErr;
      }

      // If mock agent call failed due to cleared in-memory state (e.g. server restart test)
      if (stored && resolvedAgentId === 'mock') {
        console.warn(`[CodingAgentManager] Live mock agent poll failed for ${cleanId}, serving durable stored session.`);
        return {
          name: `sessions/${stored.sessionId}`,
          id: stored.sessionId,
          prompt: stored.task,
          title: stored.title || `Task on ${stored.repository}`,
          state: stored.status,
          sourceContext: {
            source: `sources/github/${stored.repository}`,
            githubRepoContext: {
              startingBranch: stored.branch,
            },
          },
          createTime: stored.createdAt,
          updateTime: stored.updatedAt,
          gitBranch: stored.gitBranch,
          prUrl: stored.prUrl,
          resultSummary: stored.summary,
        };
      }
      throw agentErr;
    }
  }

  /**
   * Retrieve session activities on-demand.
   * Supports incremental polling via options.lastActivityTime.
   */
  public async listActivities(
    sessionId: string,
    agentId?: string,
    options?: { lastActivityTime?: string; pageSize?: number }
  ): Promise<JulesActivity[]> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const stored = await this.sessionStore.getSession(cleanId);
    const resolvedAgentId = agentId || stored?.agentId || (cleanId.startsWith('mock_sess_') ? 'mock' : this.defaultAgentId);

    try {
      const agent = this.getAgent(resolvedAgentId);
      const activities = await agent.listActivities(cleanId, options);

      if (activities.length > 0) {
        await this.sessionStore.saveActivities(cleanId, activities).catch(() => {});
        return activities;
      }

      // If live agent returns empty array (e.g. rebooted process with mock agent), consult durable store
      const storedActivities = await this.sessionStore.getActivities(cleanId, options?.lastActivityTime);
      if (storedActivities.length > 0) {
        return storedActivities;
      }

      return activities;
    } catch (err: any) {
      // RULE: Do not mask Jules API errors by swallowing them
      if (resolvedAgentId === 'jules') {
        throw err;
      }
      console.warn(`[CodingAgentManager] Could not fetch live activities for ${cleanId}, using store:`, err.message);
      return this.sessionStore.getActivities(cleanId, options?.lastActivityTime);
    }
  }

  /**
   * List all stored sessions across agents
   */
  public async listStoredSessions(agentId?: string): Promise<StoredCodingSession[]> {
    return this.sessionStore.listSessions(agentId);
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

