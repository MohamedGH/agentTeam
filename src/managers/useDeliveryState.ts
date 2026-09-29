import { useState, useEffect } from 'react';
import {
  deliveryStateManager,
  DeliveryState,
} from './deliveryStateManager';

export function useDeliveryState(): DeliveryState & {
  pushMain: typeof deliveryStateManager.pushMain;
  fetchCiRuns: typeof deliveryStateManager.fetchCiRuns;
  startCiPolling: typeof deliveryStateManager.startCiPolling;
  stopCiPolling: typeof deliveryStateManager.stopCiPolling;
  setRepositoryAndBranch: typeof deliveryStateManager.setRepositoryAndBranch;
  reset: typeof deliveryStateManager.reset;
} {
  const [state, setState] = useState<DeliveryState>(() => deliveryStateManager.getState());

  useEffect(() => {
    const unsubscribe = deliveryStateManager.subscribe((next) => {
      setState(next);
    });
    return () => unsubscribe();
  }, []);

  return {
    ...state,
    pushMain: deliveryStateManager.pushMain.bind(deliveryStateManager),
    fetchCiRuns: deliveryStateManager.fetchCiRuns.bind(deliveryStateManager),
    startCiPolling: deliveryStateManager.startCiPolling.bind(deliveryStateManager),
    stopCiPolling: deliveryStateManager.stopCiPolling.bind(deliveryStateManager),
    setRepositoryAndBranch: deliveryStateManager.setRepositoryAndBranch.bind(deliveryStateManager),
    reset: deliveryStateManager.reset.bind(deliveryStateManager),
  };
}
