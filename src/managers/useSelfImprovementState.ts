import { useState, useEffect } from 'react';
import {
  selfImprovementStateManager,
  SelfImprovementStoreState,
  SelfImprovementCycle,
} from './selfImprovementStateManager';

export function useSelfImprovementState(): SelfImprovementStoreState & {
  runCycle: (options?: {
    testCommand?: string;
    autoIntegrate?: boolean;
    commitAndPush?: boolean;
    createPullRequest?: boolean;
  }) => Promise<SelfImprovementCycle | null>;
  rollbackCycle: (cycleId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<SelfImprovementStoreState>(() =>
    selfImprovementStateManager.getState()
  );

  useEffect(() => {
    const unsubscribe = selfImprovementStateManager.subscribe((next) => {
      setState(next);
    });
    return () => unsubscribe();
  }, []);

  return {
    ...state,
    runCycle: (opts) => selfImprovementStateManager.runCycle(opts),
    rollbackCycle: (cycleId) => selfImprovementStateManager.rollbackCycle(cycleId),
    refresh: async () => {
      await selfImprovementStateManager.fetchStatus();
      await selfImprovementStateManager.fetchHistory();
    },
  };
}
