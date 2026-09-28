import { useState, useEffect } from 'react';
import { workflowStateManager, WorkflowState } from './workflowStateManager';

/**
 * Functional hook for components to subscribe to workflow state updates
 */
export function useWorkflowState(): WorkflowState {
  const [state, setState] = useState<WorkflowState>(() => workflowStateManager.getState());

  useEffect(() => {
    const unsubscribe = workflowStateManager.subscribe((nextState) => {
      setState(nextState);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return state;
}
