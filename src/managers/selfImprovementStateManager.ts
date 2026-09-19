import { errorManager, AppError } from './errorManager';

export type CyclePhase =
  | 'OBSERVE'
  | 'ANALYSE'
  | 'DETECT'
  | 'PLAN'
  | 'MODIFY'
  | 'TEST'
  | 'REVIEW'
  | 'QUALITY_GATE'
  | 'INTEGRATE'
  | 'OBSERVE_AGAIN';

export type CycleStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'HALTED_GATE';

export interface DetectedProblem {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  targetFiles: string[];
  suggestedFix: string;
  confidence: number;
}

export interface ImprovementPlan {
  id: string;
  problemId: string;
  problemTitle: string;
  title: string;
  objective: string;
  riskLevel: string;
  steps: Array<{
    stepNumber: number;
    description: string;
    targetFile: string;
    action: string;
  }>;
  verificationCommand: string;
  targetFiles: string[];
  rollbackStrategy: string;
}

export interface SelfImprovementCycle {
  id: string;
  startedAt: string;
  completedAt?: string;
  currentPhase: CyclePhase;
  status: CycleStatus;
  detectedProblems: DetectedProblem[];
  selectedProblem?: DetectedProblem;
  plan?: ImprovementPlan;
  evaluation?: {
    passed: boolean;
    testsPassed: boolean;
    testExitCode: number;
    reviewApproved: boolean;
    reviewIssues: string[];
    gateAuthorized: boolean;
    gateReason?: string;
    summary: string;
  };
  gitDelivery?: {
    delivered: boolean;
    commitSha?: string;
    pullRequestUrl?: string;
    branch?: string;
  };
  verifiedFixed?: boolean;
  error?: string;
  log: Array<{
    timestamp: string;
    phase: CyclePhase;
    message: string;
    details?: any;
  }>;
}

export interface SelfImprovementStoreState {
  currentCycle: SelfImprovementCycle | null;
  cycles: SelfImprovementCycle[];
  isRunning: boolean;
  isRollingBack: boolean;
  activePhase: CyclePhase | null;
  error: AppError | null;
  lastUpdated: string | null;
}

type StateListener = (state: SelfImprovementStoreState) => void;

class SelfImprovementStateManager {
  private listeners: Set<StateListener> = new Set();
  private eventSource: EventSource | null = null;

  private state: SelfImprovementStoreState = {
    currentCycle: null,
    cycles: [],
    isRunning: false,
    isRollingBack: false,
    activePhase: null,
    error: null,
    lastUpdated: null,
  };

  constructor() {
    this.fetchStatus();
    this.fetchHistory();
    this.connectSSE();
  }

  public getState(): SelfImprovementStoreState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[SelfImprovementStateManager] Listener error:', err);
      }
    }
  }

  public connectSSE(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/self-improvement/stream');

      this.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'CYCLE_EVENT') {
            this.state.activePhase = data.phase;
            this.state.isRunning = data.status === 'RUNNING';

            if (this.state.currentCycle && this.state.currentCycle.id === data.cycleId) {
              this.state.currentCycle.currentPhase = data.phase;
              this.state.currentCycle.status = data.status;
              this.state.currentCycle.log.push({
                timestamp: new Date().toISOString(),
                phase: data.phase,
                message: data.message,
                details: data.details,
              });
            } else {
              this.fetchStatus();
            }
            this.state.lastUpdated = new Date().toISOString();
            this.notify();
          }
        } catch {
          // ignore stream parse errors
        }
      };

      this.eventSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch {
      // ignore
    }
  }

  public async fetchStatus(): Promise<void> {
    try {
      const res = await fetch('/api/self-improvement/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.state.currentCycle = data.currentCycle || null;
      this.state.isRunning = Boolean(data.isRunning);
      if (this.state.currentCycle) {
        this.state.activePhase = this.state.currentCycle.currentPhase;
      }
      this.state.lastUpdated = new Date().toISOString();
      this.notify();
    } catch (err) {
      const parsed = errorManager.parseError(err, 'fetchStatus');
      this.state.error = parsed;
      this.notify();
    }
  }

  public async fetchHistory(): Promise<void> {
    try {
      const res = await fetch('/api/self-improvement/history');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.state.cycles = data.cycles || [];
      this.state.lastUpdated = new Date().toISOString();
      this.notify();
    } catch (err) {
      const parsed = errorManager.parseError(err, 'fetchHistory');
      this.state.error = parsed;
      this.notify();
    }
  }

  public async runCycle(options: {
    testCommand?: string;
    autoIntegrate?: boolean;
    commitAndPush?: boolean;
    createPullRequest?: boolean;
  } = {}): Promise<SelfImprovementCycle | null> {
    this.state.isRunning = true;
    this.state.error = null;
    this.notify();

    try {
      const res = await fetch('/api/self-improvement/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      this.state.currentCycle = data.cycle;
      this.state.isRunning = false;
      this.state.activePhase = data.cycle.currentPhase;
      await this.fetchHistory();
      this.notify();
      return data.cycle;
    } catch (err) {
      const parsed = errorManager.parseError(err, 'runCycle');
      this.state.error = parsed;
      this.state.isRunning = false;
      this.notify();
      return null;
    }
  }

  public async rollbackCycle(cycleId: string): Promise<boolean> {
    this.state.isRollingBack = true;
    this.notify();

    try {
      const res = await fetch(`/api/self-improvement/rollback/${cycleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      await this.fetchStatus();
      await this.fetchHistory();
      this.state.isRollingBack = false;
      this.notify();
      return true;
    } catch (err) {
      const parsed = errorManager.parseError(err, 'rollbackCycle');
      this.state.error = parsed;
      this.state.isRollingBack = false;
      this.notify();
      return false;
    }
  }
}

export const selfImprovementStateManager = new SelfImprovementStateManager();
