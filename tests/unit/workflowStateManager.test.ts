import assert from 'assert';
import {
  workflowReducer,
  WorkflowStateManager,
  INITIAL_WORKFLOW_STATE,
  WorkflowState,
} from '../../src/managers/workflowStateManager';
import { AgentStep, FinalReport } from '../../src/types';

export async function runWorkflowStateManagerUnitTests(): Promise<void> {
  console.log('\n--- Running WorkflowStateManager & Execution State Machine Tests ---');

  // Test 1: Initial state is IDLE and not COMPLETED
  {
    assert.strictEqual(INITIAL_WORKFLOW_STATE.executionState, 'IDLE');
    assert.strictEqual(INITIAL_WORKFLOW_STATE.hasExplicitCompletion, false);
    assert.strictEqual(INITIAL_WORKFLOW_STATE.steps.length, 0);
    assert.strictEqual(INITIAL_WORKFLOW_STATE.finalReport, null);
    console.log('✅ PASS: Initial workflow state is strictly IDLE');
  }

  // Test 2: Start transition sets RUNNING, resets steps and errors
  {
    const state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });
    assert.strictEqual(state.executionState, 'RUNNING');
    assert.strictEqual(state.activeAgent, 'manager');
    assert.strictEqual(state.currentPhase, 1);
    assert.strictEqual(state.elapsedSeconds, 0);
    assert.strictEqual(state.steps.length, 0);
    assert.strictEqual(state.hasExplicitCompletion, false);
    console.log('✅ PASS: START transition resets metrics and enters RUNNING state');
  }

  // Test 3: Steps accumulation does NOT cause COMPLETED (invariant: ne jamais déduire COMPLETED de steps.length > 0)
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });

    const mockStep: AgentStep = {
      id: 'step-1',
      phase: 3,
      agent: 'developer',
      action: 'Writing code',
      result: 'Code written',
      timestamp: Date.now(),
    };

    state = workflowReducer(state, { type: 'ADD_STEP', step: mockStep });
    assert.strictEqual(state.steps.length, 1);
    assert.strictEqual(state.executionState, 'RUNNING', 'State must remain RUNNING despite steps.length > 0');
    assert.strictEqual(state.hasExplicitCompletion, false);
    assert.strictEqual(state.currentPhase, 3);
    assert.strictEqual(state.activeAgent, 'developer');

    // Add another step
    const mockStep2: AgentStep = {
      id: 'step-2',
      phase: 7,
      agent: 'reviewer',
      action: 'Final audit',
      result: 'Audit ok',
      timestamp: Date.now(),
    };
    state = workflowReducer(state, { type: 'ADD_STEP', step: mockStep2 });
    assert.strictEqual(state.steps.length, 2);
    assert.notStrictEqual(state.executionState, 'COMPLETED', 'Must never deduce COMPLETED from steps.length');
    assert.strictEqual(state.executionState, 'RUNNING');
    console.log('✅ PASS: Adding steps retains RUNNING state without false COMPLETED');
  }

  // Test 4: SSE stream interrupted before complete -> FAILED (never COMPLETED)
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });
    state = workflowReducer(state, {
      type: 'ADD_STEP',
      step: {
        id: 'step-1',
        phase: 2,
        agent: 'developer',
        action: 'Coding',
        result: 'Done',
        timestamp: Date.now(),
      },
    });

    // Stream closes unexpectedly
    state = workflowReducer(state, { type: 'STREAM_ABORTED_UNEXPECTEDLY' });
    assert.strictEqual(state.executionState, 'FAILED');
    assert.strictEqual(state.hasExplicitCompletion, false);
    assert.ok(state.errorMessage?.includes('interrompu'));
    console.log('✅ PASS: Stream aborted prematurely correctly transitions to FAILED');
  }

  // Test 5: Error during streaming -> FAILED
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });
    state = workflowReducer(state, {
      type: 'FAIL',
      errorMessage: 'Provider connection timeout',
    });
    assert.strictEqual(state.executionState, 'FAILED');
    assert.strictEqual(state.errorMessage, 'Provider connection timeout');
    assert.strictEqual(state.hasExplicitCompletion, false);
    console.log('✅ PASS: Streaming error transitions explicitly to FAILED');
  }

  // Test 6: Explicit completion with valid final report -> COMPLETED
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });

    const validReport: FinalReport = {
      summary: 'All tasks implemented',
      tests: 'PASS',
      review: 'APPROVED',
      filesChanged: ['src/auth.py'],
      nextSteps: ['Merge PR'],
    };

    state = workflowReducer(state, { type: 'COMPLETE', finalReport: validReport });
    assert.strictEqual(state.executionState, 'COMPLETED');
    assert.strictEqual(state.hasExplicitCompletion, true);
    assert.strictEqual(state.finalReport?.tests, 'PASS');
    assert.strictEqual(state.finalReport?.review, 'APPROVED');
    console.log('✅ PASS: Explicit valid report transitions to COMPLETED');
  }

  // Test 7: Completion with invalid or corrupted final report -> FAILED
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });

    // Invalid report (missing tests and review)
    const invalidReport: any = { foo: 'bar' };
    state = workflowReducer(state, { type: 'COMPLETE', finalReport: invalidReport });
    assert.strictEqual(state.executionState, 'FAILED');
    assert.strictEqual(state.hasExplicitCompletion, false);
    assert.ok(state.errorMessage?.includes('invalide'));
    console.log('✅ PASS: Corrupted or invalid final report transitions to FAILED');
  }

  // Test 8: Cancellation -> CANCELLED
  {
    let state = workflowReducer(INITIAL_WORKFLOW_STATE, {
      type: 'START',
      chosenModel: 'gemini-3.7-flash',
      activeProvider: 'gemini',
    });
    state = workflowReducer(state, { type: 'CANCEL' });
    assert.strictEqual(state.executionState, 'CANCELLED');
    assert.strictEqual(state.hasExplicitCompletion, false);
    console.log('✅ PASS: Cancel transition sets CANCELLED state');
  }

  // Test 9: WorkflowStateManager instance notifications and lifecycle
  {
    const manager = new WorkflowStateManager();
    const recordedStates: WorkflowState[] = [];
    const unsubscribe = manager.subscribe((s) => {
      recordedStates.push(s);
    });

    assert.strictEqual(recordedStates.length, 1);
    assert.strictEqual(recordedStates[0].executionState, 'IDLE');

    manager.startExecution('mock-fast-model', 'gemini');
    assert.strictEqual(manager.getState().executionState, 'RUNNING');

    manager.addStep({
      id: 's-1',
      phase: 4,
      agent: 'tester',
      action: 'Running tests',
      result: 'All pass',
      timestamp: Date.now(),
    });
    assert.strictEqual(manager.getState().steps.length, 1);
    assert.strictEqual(manager.getState().currentPhase, 4);

    manager.completeExecution({
      summary: 'Done',
      tests: 'PASS',
      review: 'APPROVED',
      filesChanged: [],
      nextSteps: [],
    });
    assert.strictEqual(manager.getState().executionState, 'COMPLETED');

    unsubscribe();
    console.log('✅ PASS: WorkflowStateManager subscriber and lifecycle work reliably');
  }

  // 10. Test Model & Provider synchronization when IDLE vs RUNNING
  {
    const manager = new WorkflowStateManager();
    assert.strictEqual(manager.getState().chosenModel, 'gemini-3.7-flash');
    assert.strictEqual(manager.getState().activeProvider, 'gemini');

    // Update model and provider when IDLE
    manager.setModelAndProvider('claude-3-5-sonnet', 'anthropic');
    assert.strictEqual(manager.getState().chosenModel, 'claude-3-5-sonnet');
    assert.strictEqual(manager.getState().activeProvider, 'anthropic');

    // Start running with this provider/model
    manager.startExecution(manager.getState().chosenModel, manager.getState().activeProvider);
    assert.strictEqual(manager.getState().executionState, 'RUNNING');

    // Attempt to update while running should be ignored
    manager.setModelAndProvider('deepseek-coder', 'deepseek');
    assert.strictEqual(manager.getState().chosenModel, 'claude-3-5-sonnet');
    assert.strictEqual(manager.getState().activeProvider, 'anthropic');

    manager.cancelExecution();
    console.log('✅ PASS: setModelAndProvider synchronizes state when IDLE and guards against mid-run changes');
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('workflowStateManager')) {
  runWorkflowStateManagerUnitTests()
    .then(() => {
      console.log('All workflow state manager tests passed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test failed:', err);
      process.exit(1);
    });
}
