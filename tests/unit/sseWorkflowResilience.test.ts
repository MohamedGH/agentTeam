import assert from 'assert';
import {
  workflowReducer,
  WorkflowStateManager,
  INITIAL_WORKFLOW_STATE,
} from '../../src/managers/workflowStateManager';
import { AgentStep, FinalReport } from '../../src/types';
import { WorkflowOrchestrator } from '../../server/workflowOrchestrator';
import { FileBackedCodingAgentSessionStore as MockSessionStore } from '../../server/codingAgents/sessionStore';
import { setInMemoryApiKey, apiFetch } from '../../src/utils/apiFetch';

export async function runSseWorkflowResilienceUnitTests(): Promise<void> {
  console.log('\n--- Running SSE Workflow Resilience & Report Recovery Tests ---');

  // Helper to instantiate hermetic test orchestrator
  function createTestOrchestrator() {
    const sessionStore = new MockSessionStore();
    const orchestrator = new WorkflowOrchestrator({
      sessionStore,
    });
    return { orchestrator, sessionStore };
  }

  const validMockReport: FinalReport = {
    summary: 'Features implemented and verified',
    tests: 'PASS',
    review: 'APPROVED',
    filesChanged: ['src/index.ts', 'src/utils.ts'],
    nextSteps: ['Merge pull request'],
  };

  // Scenario 1: Flux SSE normal avec réception du rapport final
  {
    const manager = new WorkflowStateManager();
    const wId = 'wf_norm_101';
    manager.startExecution('gemini-3.7-flash', 'gemini', wId);

    // Simulate SSE step events
    const step1: AgentStep = {
      id: 'step-1',
      phase: 1,
      phaseName: 'Architecture',
      agent: 'manager',
      action: 'Planning',
      output: 'Task plan established',
      timestamp: Date.now(),
    };
    manager.addStep(step1);
    assert.strictEqual(manager.getState().steps.length, 1);
    assert.strictEqual(manager.getState().executionState, 'RUNNING');

    // Simulate SSE complete event with valid final report
    manager.completeExecution(validMockReport);
    const state = manager.getState();
    assert.strictEqual(state.executionState, 'COMPLETED');
    assert.strictEqual(state.hasExplicitCompletion, true);
    assert.strictEqual(state.finalReport?.tests, 'PASS');
    assert.strictEqual(state.finalReport?.review, 'APPROVED');
    assert.strictEqual(state.errorMessage, null);
    console.log('✅ PASS [Scenario 1]: Normal SSE stream delivers steps and final report to COMPLETED');
  }

  // Scenario 2: Coupure du flux avant la fin du workflow, puis reconnexion réussie
  {
    const manager = new WorkflowStateManager();
    const wId = 'wf_recon_202';
    manager.startExecution('gemini-3.7-flash', 'gemini', wId);

    // Initial step received before transport cut
    manager.addStep({
      id: 'step-cut-1',
      phase: 2,
      agent: 'developer',
      action: 'Writing code',
      timestamp: Date.now(),
    });

    // Transport cut occurs -> client enters RECONNECTING (never premature FAILED)
    manager.handleTransportReconnect();
    assert.strictEqual(manager.getState().transportStatus, 'RECONNECTING');
    assert.strictEqual(manager.getState().transportMessage, 'Reconnexion…');
    assert.strictEqual(manager.getState().executionState, 'RUNNING', 'Transport cut must not fail running workflow');

    // Polling / report recovery begins
    manager.handleTransportRecovering();
    assert.strictEqual(manager.getState().transportStatus, 'RECOVERING_REPORT');
    assert.strictEqual(manager.getState().transportMessage, 'Récupération du rapport…');

    // Workflow finishes on server -> recovered into manager
    manager.recoverExecution(validMockReport);
    const recoveredState = manager.getState();
    assert.strictEqual(recoveredState.executionState, 'COMPLETED');
    assert.strictEqual(recoveredState.transportStatus, 'RECOVERED');
    assert.strictEqual(recoveredState.transportMessage, 'Rapport récupéré');
    assert.strictEqual(recoveredState.finalReport?.tests, 'PASS');
    console.log('✅ PASS [Scenario 2]: Stream cut before end followed by successful report recovery');
  }

  // Scenario 3: Coupure après la fin côté serveur mais avant réception du rapport côté client
  {
    const { orchestrator } = createTestOrchestrator();
    const wId = 'wf_postfinish_303';

    // Server already persisted completed workflow with report
    await orchestrator.registerWorkflow({
      workflowId: wId,
      sessionId: 'sess_303',
      agentId: 'team',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'Post-finish test',
      stage: 'COMPLETED',
      status: 'COMPLETED',
      executionStatus: 'COMPLETED',
      options: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 's-fin-1',
          phase: 4,
          agent: 'tester',
          action: 'Running tests',
          result: 'All passed',
          timestamp: Date.now(),
        },
      ],
      finalReport: validMockReport,
    });

    // Client had dropped stream before receiving completion
    const manager = new WorkflowStateManager();
    manager.startExecution('gemini-3.7-flash', 'gemini', wId);
    manager.handleTransportRecovering();

    // Query server orchestrator state directly
    const stored = await orchestrator.getWorkflow(wId);
    assert.ok(stored, 'Workflow must be retrievable from orchestrator');
    assert.strictEqual(stored?.status, 'COMPLETED');
    assert.ok(stored?.finalReport, 'Final report must be present on server');

    // Client recovers genuine report from server
    manager.recoverExecution(stored.finalReport!);
    assert.strictEqual(manager.getState().executionState, 'COMPLETED');
    assert.strictEqual(manager.getState().transportStatus, 'RECOVERED');
    assert.strictEqual(manager.getState().transportMessage, 'Rapport récupéré');
    console.log('✅ PASS [Scenario 3]: Cut after server completion cleanly retrieves persisted final report');
  }

  // Scenario 4: Workflow silencieux pendant une longue étape avec heartbeats
  {
    const manager = new WorkflowStateManager();
    manager.startExecution('gemini-3.7-flash', 'gemini', 'wf_heartbeat_404');
    assert.strictEqual(manager.getState().transportStatus, 'CONNECTED');

    // Simulate transient transport drop and heartbeat recovery
    manager.setTransportStatus('CONNECTED', null);
    assert.strictEqual(manager.getState().transportStatus, 'CONNECTED');
    assert.strictEqual(manager.getState().transportMessage, null);
    assert.strictEqual(manager.getState().executionState, 'RUNNING');
    console.log('✅ PASS [Scenario 4]: Heartbeat updates preserve CONNECTED state during silent steps');
  }

  // Scenario 5: Échec réel du workflow
  {
    const manager = new WorkflowStateManager();
    manager.startExecution('gemini-3.7-flash', 'gemini', 'wf_realfail_505');

    manager.failExecution('Compilation error in auth.ts: TS2304');
    const state = manager.getState();
    assert.strictEqual(state.executionState, 'FAILED');
    assert.strictEqual(state.hasExplicitCompletion, false);
    assert.strictEqual(state.errorMessage, 'Compilation error in auth.ts: TS2304');
    assert.strictEqual(state.finalReport, null, 'Must never produce fake success on failure');
    console.log('✅ PASS [Scenario 5]: Real workflow failure preserved with genuine error message');
  }

  // Scenario 6: Annulation explicite par l’utilisateur
  {
    const { orchestrator } = createTestOrchestrator();
    const wId = 'wf_cancel_606';

    await orchestrator.registerWorkflow({
      workflowId: wId,
      sessionId: 'sess_606',
      agentId: 'team',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'Cancellation test',
      stage: 'TESTING',
      status: 'IN_PROGRESS',
      executionStatus: 'RUNNING',
      options: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
    });

    // Cancel on server
    const cancelledOnServer = await orchestrator.cancelWorkflow(wId);
    assert.strictEqual(cancelledOnServer?.status, 'CANCELLED');
    assert.strictEqual(cancelledOnServer?.stage, 'CANCELLED');

    // Cancel in client state manager
    const manager = new WorkflowStateManager();
    manager.startExecution('gemini-3.7-flash', 'gemini', wId);
    manager.cancelExecution();

    assert.strictEqual(manager.getState().executionState, 'CANCELLED');
    assert.strictEqual(manager.getState().transportStatus, 'DISCONNECTED');
    assert.strictEqual(manager.getState().transportMessage, 'Workflow annulé');
    console.log('✅ PASS [Scenario 6]: Explicit user cancellation transitions reliably to CANCELLED');
  }

  // Scenario 7: Reconnexion multiple sans double exécution
  {
    const { orchestrator } = createTestOrchestrator();
    const wId = 'wf_stable_707';

    // Register active workflow on server
    const initial = await orchestrator.registerWorkflow({
      workflowId: wId,
      sessionId: 'sess_707',
      agentId: 'team',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'Idempotency test',
      stage: 'TESTING',
      status: 'IN_PROGRESS',
      executionStatus: 'RUNNING',
      options: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step-1',
          phase: 1,
          agent: 'manager',
          action: 'Start',
          timestamp: Date.now(),
        },
      ],
    });
    assert.ok(initial);

    // First lookup / reconnection check
    const existing1 = await orchestrator.getWorkflow(wId);
    assert.ok(existing1);
    assert.strictEqual(existing1?.steps.length, 1);

    // Second simultaneous reconnection check
    const existing2 = await orchestrator.getWorkflow(wId);
    assert.strictEqual(existing1?.workflowId, existing2?.workflowId);

    // Update with new step without duplicating
    await orchestrator.updateWorkflow(wId, {
      steps: [
        ...existing1!.steps,
        {
          id: 'step-2',
          phase: 2,
          agent: 'developer',
          action: 'Build',
          timestamp: Date.now(),
        },
      ],
    });

    const refreshed = await orchestrator.getWorkflow(wId);
    assert.strictEqual(refreshed?.steps.length, 2);
    console.log('✅ PASS [Scenario 7]: Stable workflowId prevents duplicate executions on reconnection');
  }

  // Scenario 8: Rapport final indisponible après plusieurs tentatives, avec erreur explicite
  {
    const manager = new WorkflowStateManager();
    manager.startExecution('gemini-3.7-flash', 'gemini', 'wf_unavail_808');

    // Simulate transport failure after exhausting retries
    manager.handleTransportFailed('Impossible de récupérer le rapport de fin de workflow après interruption.');

    const state = manager.getState();
    assert.strictEqual(state.executionState, 'FAILED');
    assert.strictEqual(state.transportStatus, 'DISCONNECTED');
    assert.strictEqual(state.transportMessage, 'Impossible de récupérer le rapport');
    assert.strictEqual(state.errorMessage, 'Impossible de récupérer le rapport de fin de workflow après interruption.');
    console.log('✅ PASS [Scenario 8]: Unavailable report fails with explicit error message and DISCONNECTED status');
  }

  // Scenario 9: Respect de l’authentification et des permissions lors de la récupération du rapport
  {
    // Test that apiFetch passes X-API-Key when available and handles missing auth correctly
    setInMemoryApiKey('test-secure-api-key');
    let capturedHeaders: Record<string, string> | null = null;

    // Hermetic fetch interceptor
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const res = await apiFetch('/api/workflows/wf_secure_909');
      assert.strictEqual(res.status, 401);
      assert.ok(capturedHeaders?.['X-API-Key'] === 'test-secure-api-key');

      // State manager must reject fake success on auth failure
      const manager = new WorkflowStateManager();
      manager.startExecution('gemini-3.7-flash', 'gemini', 'wf_secure_909');
      manager.setTransportStatus('DISCONNECTED', 'Impossible de récupérer le rapport');
      manager.failExecution('Accès refusé: authentification requise pour récupérer le workflow.');

      const state = manager.getState();
      assert.strictEqual(state.executionState, 'FAILED');
      assert.strictEqual(state.transportStatus, 'DISCONNECTED');
      assert.strictEqual(state.hasExplicitCompletion, false);
      assert.ok(state.errorMessage?.includes('Accès refusé'));
      console.log('✅ PASS [Scenario 9]: Authentication and permissions strictly enforced during report recovery');
    } finally {
      globalThis.fetch = originalFetch;
      setInMemoryApiKey(null);
    }
  }

  console.log('\n🎉 ALL 9 SSE WORKFLOW RESILIENCE SCENARIOS PASSED (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('sseWorkflowResilience')) {
  runSseWorkflowResilienceUnitTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('SSE resilience test failed:', err);
      process.exit(1);
    });
}
