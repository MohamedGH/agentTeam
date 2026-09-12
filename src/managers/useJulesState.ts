import { useState, useEffect } from 'react';
import { julesStateManager, JulesStoreState } from './julesStateManager';

/**
 * Custom React Hook to consume Jules State Store
 */
export const useJulesState = (): JulesStoreState & {
  startSession: typeof julesStateManager.startSession;
  fetchSession: typeof julesStateManager.fetchSession;
  fetchActivities: typeof julesStateManager.fetchActivities;
  sendMessage: typeof julesStateManager.sendMessage;
  approvePlan: typeof julesStateManager.approvePlan;
  selectSession: typeof julesStateManager.selectSession;
  setPolling: typeof julesStateManager.setPolling;
  clearError: typeof julesStateManager.clearError;
} => {
  const [state, setState] = useState<JulesStoreState>(() => julesStateManager.getState());

  useEffect(() => {
    const unsubscribe = julesStateManager.subscribe((nextState) => {
      setState(nextState);
    });
    return () => {
      unsubscribe();
      julesStateManager.stopPolling();
    };
  }, []);

  return {
    ...state,
    startSession: julesStateManager.startSession.bind(julesStateManager),
    fetchSession: julesStateManager.fetchSession.bind(julesStateManager),
    fetchActivities: julesStateManager.fetchActivities.bind(julesStateManager),
    sendMessage: julesStateManager.sendMessage.bind(julesStateManager),
    approvePlan: julesStateManager.approvePlan.bind(julesStateManager),
    selectSession: julesStateManager.selectSession.bind(julesStateManager),
    setPolling: julesStateManager.setPolling.bind(julesStateManager),
    clearError: julesStateManager.clearError.bind(julesStateManager),
  };
};
