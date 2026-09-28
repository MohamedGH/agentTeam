import { AgentRole, AgentStep, AIProviderId, FinalReport } from '../types';

export type ExecutionState = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WorkflowState {
  readonly executionState: ExecutionState;
  readonly activeAgent: AgentRole | null;
  readonly currentPhase: number;
  readonly chosenModel: string;
  readonly activeProvider: AIProviderId;
  readonly elapsedSeconds: number;
  readonly steps: ReadonlyArray<AgentStep>;
  readonly finalReport: FinalReport | null;
  readonly errorMessage: string | null;
  readonly errorDetails: string | null;
  readonly hasExplicitCompletion: boolean;
}

export type WorkflowStateListener = (state: WorkflowState) => void;

export const INITIAL_WORKFLOW_STATE: WorkflowState = Object.freeze({
  executionState: 'IDLE' as ExecutionState,
  activeAgent: null,
  currentPhase: 1,
  chosenModel: 'gemini-3.7-flash',
  activeProvider: 'gemini' as AIProviderId,
  elapsedSeconds: 0,
  steps: [] as ReadonlyArray<AgentStep>,
  finalReport: null,
  errorMessage: null,
  errorDetails: null,
  hasExplicitCompletion: false,
});

/**
 * Pure reducer function for immutable state transitions
 */
export function workflowReducer(
  state: WorkflowState,
  action:
    | { type: 'START'; chosenModel: string; activeProvider: AIProviderId }
    | { type: 'TICK'; delta: number }
    | { type: 'ADD_STEP'; step: AgentStep }
    | { type: 'COMPLETE'; finalReport: FinalReport }
    | { type: 'FAIL'; errorMessage: string; errorDetails?: string | null }
    | { type: 'CANCEL' }
    | { type: 'RESET' }
    | { type: 'STREAM_ABORTED_UNEXPECTEDLY' }
): WorkflowState {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        executionState: 'RUNNING',
        activeAgent: 'manager',
        currentPhase: 1,
        chosenModel: action.chosenModel,
        activeProvider: action.activeProvider,
        elapsedSeconds: 0,
        steps: [],
        finalReport: null,
        errorMessage: null,
        errorDetails: null,
        hasExplicitCompletion: false,
      };

    case 'TICK':
      if (state.executionState !== 'RUNNING') return state;
      return {
        ...state,
        elapsedSeconds: Number((state.elapsedSeconds + action.delta).toFixed(1)),
      };

    case 'ADD_STEP': {
      if (state.executionState !== 'RUNNING') return state;
      const nextSteps = [...state.steps, action.step];
      const nextPhase = action.step.phase || state.currentPhase;
      const nextAgent = action.step.agent || state.activeAgent;
      return {
        ...state,
        steps: nextSteps,
        currentPhase: nextPhase,
        activeAgent: nextAgent,
      };
    }

    case 'COMPLETE': {
      // Validate final report structure
      const report = action.finalReport;
      const isValid =
        report &&
        typeof report === 'object' &&
        typeof report.tests === 'string' &&
        typeof report.review === 'string';

      if (!isValid) {
        return {
          ...state,
          executionState: 'FAILED',
          errorMessage: 'Le workflow a retourné un rapport final invalide ou corrompu.',
          hasExplicitCompletion: false,
        };
      }

      return {
        ...state,
        executionState: 'COMPLETED',
        finalReport: report,
        hasExplicitCompletion: true,
        errorMessage: null,
      };
    }

    case 'FAIL':
      return {
        ...state,
        executionState: 'FAILED',
        errorMessage: action.errorMessage,
        errorDetails: action.errorDetails || null,
        hasExplicitCompletion: false,
      };

    case 'CANCEL':
      if (state.executionState !== 'RUNNING') return state;
      return {
        ...state,
        executionState: 'CANCELLED',
        hasExplicitCompletion: false,
      };

    case 'STREAM_ABORTED_UNEXPECTEDLY':
      // If stream ends without complete event and we were running
      if (state.executionState === 'RUNNING') {
        return {
          ...state,
          executionState: 'FAILED',
          errorMessage: 'Flux SSE interrompu avant réception du rapport de fin de workflow.',
          hasExplicitCompletion: false,
        };
      }
      return state;

    case 'RESET':
      return {
        ...INITIAL_WORKFLOW_STATE,
        chosenModel: state.chosenModel,
        activeProvider: state.activeProvider,
      };

    default:
      return state;
  }
}

/**
 * Central State Manager for Workflow Execution
 */
export class WorkflowStateManager {
  private state: WorkflowState = INITIAL_WORKFLOW_STATE;
  private readonly listeners: Set<WorkflowStateListener> = new Set();
  private timerId: NodeJS.Timeout | null = null;

  public getState(): WorkflowState {
    return this.state;
  }

  public subscribe(listener: WorkflowStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private dispatch(action: Parameters<typeof workflowReducer>[1]): void {
    const nextState = workflowReducer(this.state, action);
    if (nextState !== this.state) {
      this.state = nextState;
      this.notify();
    }
  }

  private notify(): void {
    const currentState = this.state;
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Error in WorkflowStateManager subscriber:', err);
      }
    });
  }

  public startExecution(chosenModel: string, activeProvider: AIProviderId): void {
    this.stopTimer();
    this.dispatch({ type: 'START', chosenModel, activeProvider });

    // Start 100ms precision elapsed ticker
    this.timerId = setInterval(() => {
      this.dispatch({ type: 'TICK', delta: 0.1 });
    }, 100);
  }

  public addStep(step: AgentStep): void {
    this.dispatch({ type: 'ADD_STEP', step });
  }

  public completeExecution(finalReport: FinalReport): void {
    this.stopTimer();
    this.dispatch({ type: 'COMPLETE', finalReport });
  }

  public failExecution(errorMessage: string, errorDetails?: string | null): void {
    this.stopTimer();
    this.dispatch({ type: 'FAIL', errorMessage, errorDetails });
  }

  public cancelExecution(): void {
    this.stopTimer();
    this.dispatch({ type: 'CANCEL' });
  }

  public handleStreamAborted(): void {
    this.stopTimer();
    this.dispatch({ type: 'STREAM_ABORTED_UNEXPECTEDLY' });
  }

  public reset(): void {
    this.stopTimer();
    this.dispatch({ type: 'RESET' });
  }

  private stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export const workflowStateManager = new WorkflowStateManager();
