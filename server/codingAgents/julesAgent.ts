import { ICodingAgent } from './codingAgent';
import {
  CodingAgentInfo,
  CodingAgentResult,
  CodingAgentTask,
  CreateJulesSessionRequest,
  JulesActivity,
  JulesAutomationMode,
  JulesSession,
  JulesSessionState,
  JulesSource,
} from './types';

export interface JulesAgentOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultTimeoutMs?: number;
}

/**
 * JulesAgent
 * 
 * Official Google Jules API (v1alpha) integration.
 * Docs: https://jules.googleapis.com/v1alpha
 * Header: X-Goog-Api-Key
 * Environment Variable: JULES_API_KEY
 */
export class JulesAgent implements ICodingAgent {
  public readonly id = 'jules';
  public readonly name = 'Google Jules';
  private baseUrl: string;
  private apiKey: string | null = null;
  private defaultTimeoutMs: number;

  constructor(options: JulesAgentOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://jules.googleapis.com/v1alpha';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
  }

  /**
   * Lazily resolve API key from process.env.JULES_API_KEY.
   * Never hardcodes keys and avoids throwing on import when key is missing.
   */
  private getApiKey(): string | null {
    return process.env.JULES_API_KEY?.trim() || null;
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  public getInfo(): CodingAgentInfo {
    return {
      id: this.id,
      name: this.name,
      type: 'autonomous_agent',
      configured: this.isConfigured(),
      capabilities: {
        gitHubIntegration: true,
        autoPullRequests: true,
        multiStepPlanning: true,
        asyncExecution: true,
      },
      supportedAutomationModes: ['AUTOMATION_MODE_UNSPECIFIED', 'AUTO_CREATE_PR', 'MANUAL'],
      description:
        "Google's autonomous AI coding agent powered by Gemini models for multi-step repository planning, coding, and automated GitHub Pull Request creation.",
    };
  }

  /**
   * Helper to make authenticated requests to Jules REST API
   */
  private async fetchJules<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
      body?: any;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'JULES_API_KEY environment variable is not configured. Please define JULES_API_KEY in your settings or .env file.'
      );
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || this.defaultTimeoutMs);

    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        let parsedMessage = '';
        try {
          const parsed = JSON.parse(errorText);
          parsedMessage = parsed.error?.message || parsed.message || errorText;
        } catch {
          parsedMessage = errorText;
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Jules API authentication failed (${res.status}): ${parsedMessage || 'Check your JULES_API_KEY'}`
          );
        }
        if (res.status === 404) {
          throw new Error(`Jules resource not found (${res.status}): ${parsedMessage || cleanEndpoint}`);
        }
        if (res.status === 429) {
          throw new Error(`Jules API rate limit exceeded (429): ${parsedMessage}`);
        }

        throw new Error(`Jules API HTTP error ${res.status}: ${parsedMessage || res.statusText}`);
      }

      return (await res.json()) as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Jules API request timed out after ${options.timeoutMs || this.defaultTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalize source identifier for Jules API.
   * e.g., "MohamedGH/agentTeam" -> "sources/github/MohamedGH/agentTeam"
   */
  public formatSourceResource(repo: string): string {
    const trimmed = repo.trim();
    if (trimmed.startsWith('sources/')) {
      return trimmed;
    }
    // Remove leading github.com/ if passed
    const cleanRepo = trimmed.replace(/^https?:\/\/github\.com\//, '').replace(/^\/+|\/+$/g, '');
    return `sources/github/${cleanRepo}`;
  }

  /**
   * List connected GitHub sources in the user's Jules workspace
   */
  public async listSources(): Promise<JulesSource[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const res = await this.fetchJules<{ sources?: any[] }>('/sources');
      if (!res.sources || !Array.isArray(res.sources)) {
        return [];
      }
      return res.sources.map((s) => ({
        name: s.name,
        displayName: s.displayName || s.name,
        githubRepo: s.githubRepo || s.githubRepoContext,
      }));
    } catch (err: any) {
      console.warn('[JulesAgent] Failed to list sources:', err.message);
      return [];
    }
  }

  /**
   * Create a coding session via POST /v1alpha/sessions
   */
  public async createSession(task: CodingAgentTask): Promise<JulesSession> {
    if (!task.repository?.trim()) {
      throw new Error('GitHub repository is required to create a Jules coding session (e.g. "owner/repo")');
    }
    if (!task.task?.trim()) {
      throw new Error('Task prompt is required to create a Jules coding session');
    }

    const sourceResource = this.formatSourceResource(task.repository);
    const branch = task.branch?.trim() || 'main';

    let automationMode: JulesAutomationMode = 'AUTOMATION_MODE_UNSPECIFIED';
    if (task.automationMode === 'AUTO_CREATE_PR') {
      automationMode = 'AUTO_CREATE_PR';
    } else if (task.automationMode === 'MANUAL') {
      automationMode = 'MANUAL';
    }

    const requestPayload: CreateJulesSessionRequest = {
      prompt: task.task.trim(),
      title: task.title?.trim() || `Task: ${task.task.trim().slice(0, 60)}`,
      sourceContext: {
        source: sourceResource,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
      automationMode,
      requirePlanApproval: Boolean(task.requirePlanApproval),
    };

    const sessionResponse = await this.fetchJules<any>('/sessions', {
      method: 'POST',
      body: requestPayload,
    });

    const sessionId = sessionResponse.name ? sessionResponse.name.split('/').pop() : sessionResponse.id;

    return {
      name: sessionResponse.name || `sessions/${sessionId}`,
      id: sessionId || 'unknown_session',
      prompt: sessionResponse.prompt || task.task,
      title: sessionResponse.title || requestPayload.title,
      state: (sessionResponse.state as JulesSessionState) || 'QUEUED',
      sourceContext: sessionResponse.sourceContext || requestPayload.sourceContext,
      automationMode: sessionResponse.automationMode || automationMode,
      requirePlanApproval: sessionResponse.requirePlanApproval,
      createTime: sessionResponse.createTime,
      updateTime: sessionResponse.updateTime,
      prUrl: sessionResponse.prUrl || sessionResponse.pullRequestUrl,
      gitBranch: sessionResponse.gitBranch,
      resultSummary: sessionResponse.resultSummary,
    };
  }

  /**
   * Retrieve a session by ID
   */
  public async getSession(sessionId: string): Promise<JulesSession> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    const res = await this.fetchJules<any>(`/sessions/${cleanId}`);

    return {
      name: res.name || `sessions/${cleanId}`,
      id: cleanId,
      prompt: res.prompt,
      title: res.title,
      state: (res.state as JulesSessionState) || 'STATE_UNSPECIFIED',
      sourceContext: res.sourceContext,
      automationMode: res.automationMode,
      requirePlanApproval: res.requirePlanApproval,
      createTime: res.createTime,
      updateTime: res.updateTime,
      prUrl: res.prUrl || res.pullRequestUrl,
      gitBranch: res.gitBranch,
      resultSummary: res.resultSummary,
    };
  }

  /**
   * List activities for a session via GET /v1alpha/sessions/{id}/activities
   */
  public async listActivities(sessionId: string): Promise<JulesActivity[]> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    try {
      const res = await this.fetchJules<{ activities?: any[] }>(`/sessions/${cleanId}/activities`);
      if (!res.activities || !Array.isArray(res.activities)) {
        return [];
      }
      return res.activities.map((act) => ({
        name: act.name,
        id: act.id || act.name?.split('/').pop(),
        originator: act.originator || 'AGENT',
        description: act.description || act.message || act.summary || '',
        createTime: act.createTime,
        planApproved: act.planApproved,
        output: act.output,
        prUrl: act.prUrl || act.pullRequestUrl,
        gitBranch: act.gitBranch,
        actionType: act.actionType,
      }));
    } catch (err: any) {
      console.warn(`[JulesAgent] Failed to fetch activities for session ${cleanId}:`, err.message);
      return [];
    }
  }

  /**
   * Send a message to an active Jules session
   */
  public async sendMessage(sessionId: string, message: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    await this.fetchJules<any>(`/sessions/${cleanId}:sendMessage`, {
      method: 'POST',
      body: { message },
    });
  }

  /**
   * Approve plan for sessions that require plan approval
   */
  public async approvePlan(sessionId: string): Promise<void> {
    const cleanId = sessionId.replace(/^sessions\//, '');
    await this.fetchJules<any>(`/sessions/${cleanId}:approvePlan`, {
      method: 'POST',
      body: {},
    });
  }

  /**
   * Execute task end-to-end against Google Jules with active polling
   */
  public async executeTask(
    task: CodingAgentTask,
    onProgress?: (activity: JulesActivity) => void
  ): Promise<CodingAgentResult> {
    const startMs = Date.now();
    const branch = task.branch?.trim() || 'main';

    // If API key is not configured, give a clear instructive response
    if (!this.isConfigured()) {
      return {
        agentId: this.id,
        sessionId: 'unconfigured_session',
        status: 'FAILED',
        repository: task.repository,
        branch,
        title: task.title,
        prompt: task.task,
        summary:
          'Jules execution could not start: JULES_API_KEY environment variable is not configured. Please define JULES_API_KEY in your environment to connect directly to the Google Jules autonomous coding agent.',
        activities: [
          {
            id: 'act_unconfigured',
            originator: 'SYSTEM',
            description: 'JULES_API_KEY is not set. Real cloud API calls require a valid Google Jules API key.',
            createTime: new Date().toISOString(),
          },
        ],
        durationMs: Date.now() - startMs,
        error: 'JULES_API_KEY is missing',
      };
    }

    try {
      // 1. Create Session
      const session = await this.createSession(task);
      const sessionId = session.id;

      let currentStatus: JulesSessionState = session.state;
      let activities: JulesActivity[] = [];
      const seenActivityIds = new Set<string>();

      const pollIntervalMs = (task.pollIntervalSeconds || 3) * 1000;
      const timeoutMs = (task.timeoutSeconds || 120) * 1000;

      // 2. Poll until terminal state (COMPLETED, FAILED, PAUSED) or timeout
      while (
        currentStatus !== 'COMPLETED' &&
        currentStatus !== 'FAILED' &&
        currentStatus !== 'PAUSED' &&
        Date.now() - startMs < timeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        const updatedSession = await this.getSession(sessionId);
        currentStatus = updatedSession.state;

        // Fetch activities
        const latestActivities = await this.listActivities(sessionId);
        for (const act of latestActivities) {
          const actId = act.id || act.name || act.description;
          if (actId && !seenActivityIds.has(actId)) {
            seenActivityIds.add(actId);
            activities.push(act);
            if (onProgress) {
              onProgress(act);
            }
          }
        }

        if (updatedSession.prUrl) {
          session.prUrl = updatedSession.prUrl;
        }
        if (updatedSession.gitBranch) {
          session.gitBranch = updatedSession.gitBranch;
        }
        if (updatedSession.resultSummary) {
          session.resultSummary = updatedSession.resultSummary;
        }
      }

      return {
        agentId: this.id,
        sessionId,
        status: currentStatus,
        repository: task.repository,
        branch,
        title: task.title,
        prompt: task.task,
        prUrl: session.prUrl,
        gitBranch: session.gitBranch,
        summary:
          session.resultSummary ||
          (currentStatus === 'COMPLETED'
            ? `Google Jules autonomously completed task on ${task.repository} (${branch}).${session.prUrl ? ` Pull Request created: ${session.prUrl}` : ''}`
            : `Google Jules session status: ${currentStatus}`),
        activities,
        rawSession: session,
        durationMs: Date.now() - startMs,
      };
    } catch (err: any) {
      return {
        agentId: this.id,
        sessionId: 'error_session',
        status: 'FAILED',
        repository: task.repository,
        branch,
        title: task.title,
        prompt: task.task,
        summary: `Error running Google Jules agent: ${err.message}`,
        activities: [],
        durationMs: Date.now() - startMs,
        error: err.message,
      };
    }
  }
}
