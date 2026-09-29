import { errorManager } from './errorManager';

export type PushStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type CiStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'NOT_FOUND' | 'UNKNOWN';

export interface CiStep {
  name: string;
  status: string;
  conclusion: string | null;
  number?: number;
}

export interface CiJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps: CiStep[];
}

export interface CiRunData {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  head_commit?: {
    message: string;
  };
}

export interface DeliveryState {
  repository: string;
  branch: string;
  commitSha: string | null;
  pushStatus: PushStatus;
  pushError: string | null;
  ciRunId: number | null;
  ciStatus: CiStatus;
  ciConclusion: string | null;
  ciHeadSha: string | null;
  ciRun: CiRunData | null;
  jobs: CiJob[];
  trackedSha: string | null;
  pollAttempts: number;
  isPolling: boolean;
  updatedAt: string | null;
  lastUpdated: string | null;
}

type DeliveryListener = (state: DeliveryState) => void;

export class DeliveryStateManager {
  private listeners: Set<DeliveryListener> = new Set();
  private pollTimer: any = null;
  private readonly MAX_POLL_ATTEMPTS = 20; // 20 * 3s = 60s
  private readonly POLL_INTERVAL_MS = 3000;

  private state: DeliveryState = {
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    commitSha: null,
    pushStatus: 'IDLE',
    pushError: null,
    ciRunId: null,
    ciStatus: 'IDLE',
    ciConclusion: null,
    ciHeadSha: null,
    ciRun: null,
    jobs: [],
    trackedSha: null,
    pollAttempts: 0,
    isPolling: false,
    updatedAt: null,
    lastUpdated: null,
  };

  public subscribe(listener: DeliveryListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public getState(): DeliveryState {
    return this.state;
  }

  private notify(): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      ciHeadSha: this.state.ciRun?.head_sha || null,
      updatedAt: now,
      lastUpdated: now,
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public setRepositoryAndBranch(repository: string, branch: string): void {
    this.state = {
      ...this.state,
      repository: repository.trim(),
      branch: branch.trim(),
    };
    this.notify();
  }

  /**
   * Reset the delivery tracking state
   */
  public reset(): void {
    this.stopCiPolling();
    this.state = {
      ...this.state,
      commitSha: null,
      pushStatus: 'IDLE',
      pushError: null,
      ciRunId: null,
      ciStatus: 'IDLE',
      ciConclusion: null,
      ciRun: null,
      jobs: [],
      trackedSha: null,
      pollAttempts: 0,
      isPolling: false,
    };
    this.notify();
  }

  /**
   * Executes a git push to GitHub and immediately sets up strict CI tracking for the returned commitSha
   */
  public async pushMain(options?: {
    repository?: string;
    branch?: string;
    token?: string;
  }): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    const repository = (options?.repository || this.state.repository).trim();
    const branch = (options?.branch || this.state.branch).trim();
    const token = options?.token?.trim();

    // 1. Cancel any active previous polling timer
    this.stopCiPolling();

    this.state = {
      ...this.state,
      repository,
      branch,
      pushStatus: 'RUNNING',
      pushError: null,
      ciRunId: null,
      ciConclusion: null,
      ciRun: null,
      jobs: [],
      pollAttempts: 0,
    };
    this.notify();

    try {
      const res = await fetch('/api/github/push-main', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository,
          branch,
          token: token || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'Push failed';
        this.state = {
          ...this.state,
          pushStatus: 'FAILED',
          pushError: errorMsg,
          ciStatus: 'IDLE',
        };
        this.notify();
        return { success: false, error: errorMsg };
      }

      const actualSha = data.push?.commitSha || null;

      // Handle matching immediate CI run if returned and matching actual commit
      let immediateRun: CiRunData | null = null;
      let immediateJobs: CiJob[] = [];
      let immediateCiStatus: CiStatus = 'QUEUED';
      let immediateCiConclusion: string | null = null;

      if (data.ciRun && actualSha && data.ciRun.head_sha === actualSha) {
        immediateRun = data.ciRun;
        immediateJobs = data.jobs || [];
        immediateCiConclusion = data.ciRun.conclusion || null;
        if (data.ciRun.status === 'completed') {
          immediateCiStatus = 'COMPLETED';
        } else if (data.ciRun.status === 'in_progress') {
          immediateCiStatus = 'RUNNING';
        } else {
          immediateCiStatus = 'QUEUED';
        }
      }

      this.state = {
        ...this.state,
        pushStatus: 'COMPLETED',
        commitSha: actualSha,
        trackedSha: actualSha,
        ciRun: immediateRun,
        ciRunId: immediateRun?.id || null,
        jobs: immediateJobs,
        ciStatus: immediateCiStatus,
        ciConclusion: immediateCiConclusion,
        pollAttempts: 0,
      };
      this.notify();

      // If SHA exists and CI is not yet completed, start tracked polling
      if (actualSha && immediateCiStatus !== 'COMPLETED') {
        this.startCiPolling(actualSha);
      }

      return { success: true, commitSha: actualSha || undefined };
    } catch (err: any) {
      const errorMsg = err.message || 'Push failed unexpectedly';
      errorManager.parseError(err, 'Git Push Delivery');
      this.state = {
        ...this.state,
        pushStatus: 'FAILED',
        pushError: errorMsg,
        ciStatus: 'IDLE',
      };
      this.notify();
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Fetches CI status for a specific SHA or latest run.
   * STRICT INVARIANT: If targetSha is provided, NEVER fall back to runs[0].
   */
  public async fetchCiRuns(targetSha?: string | null): Promise<void> {
    try {
      const sha = targetSha !== undefined ? targetSha : this.state.trackedSha;
      const shaQuery = sha ? `&head_sha=${encodeURIComponent(sha)}` : '';
      const repo = encodeURIComponent(this.state.repository);

      const res = await fetch(`/api/github/ci-runs?repository=${repo}${shaQuery}`);
      if (!res.ok) return;

      const data = await res.json();
      if (!data.success) return;

      if (sha) {
        // STRICT: Find ONLY run matching head_sha === sha. DO NOT fallback to runs[0]!
        const matched = data.selectedRun?.head_sha === sha
          ? data.selectedRun
          : (data.runs ? data.runs.find((r: any) => r.head_sha === sha) : null);

        if (matched) {
          const isCompleted = matched.status === 'completed';
          this.state = {
            ...this.state,
            ciRun: matched,
            ciRunId: matched.id,
            jobs: data.jobs || [],
            ciConclusion: matched.conclusion || null,
            ciStatus: isCompleted ? 'COMPLETED' : matched.status === 'in_progress' ? 'RUNNING' : 'QUEUED',
          };
          this.notify();

          if (isCompleted) {
            this.stopCiPolling();
          }
        } else {
          // SHA specified but no workflow run found yet
          const attempts = this.state.pollAttempts + 1;
          const isTimedOut = attempts >= this.MAX_POLL_ATTEMPTS;

          this.state = {
            ...this.state,
            ciRun: null,
            ciRunId: null,
            jobs: [],
            pollAttempts: attempts,
            ciStatus: isTimedOut ? 'NOT_FOUND' : 'QUEUED',
          };
          this.notify();

          if (isTimedOut) {
            this.stopCiPolling();
          }
        }
      } else {
        // No specific SHA tracked, use default selectedRun if available
        const run = data.selectedRun || (data.runs && data.runs.length > 0 ? data.runs[0] : null);
        if (run) {
          const isCompleted = run.status === 'completed';
          this.state = {
            ...this.state,
            ciRun: run,
            ciRunId: run.id,
            jobs: data.jobs || [],
            ciConclusion: run.conclusion || null,
            ciStatus: isCompleted ? 'COMPLETED' : run.status === 'in_progress' ? 'RUNNING' : 'QUEUED',
          };
          this.notify();
        }
      }
    } catch (e) {
      console.warn('[DeliveryStateManager] Failed to fetch CI runs:', e);
    }
  }

  /**
   * Starts a single robust polling loop for a specific SHA.
   * Cancels any prior interval to guarantee zero concurrent polling.
   */
  public startCiPolling(targetSha: string): void {
    this.stopCiPolling();

    this.state = {
      ...this.state,
      trackedSha: targetSha,
      isPolling: true,
      pollAttempts: 0,
      ciStatus: 'QUEUED',
    };
    this.notify();

    // Trigger immediate first check
    this.fetchCiRuns(targetSha);

    this.pollTimer = setInterval(async () => {
      if (!this.state.isPolling || !this.state.trackedSha) {
        this.stopCiPolling();
        return;
      }
      await this.fetchCiRuns(this.state.trackedSha);
    }, this.POLL_INTERVAL_MS);

    if (this.pollTimer && typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref();
    }
  }

  /**
   * Stops any in-flight CI polling loop and cleans up the timer
   */
  public stopCiPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.state.isPolling) {
      this.state = {
        ...this.state,
        isPolling: false,
      };
      this.notify();
    }
  }
}

export const deliveryStateManager = new DeliveryStateManager();
