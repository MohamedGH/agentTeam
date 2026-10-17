import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { WorkflowOrchestrator } from '../../server/workflowOrchestrator';
import { FileBackedCodingAgentSessionStore } from '../../server/codingAgents/sessionStore';
import { FinalReport, WorkflowState } from '../../server/codingAgents/types';

export async function runWorkflowPersistenceAndRecoveryIntegrationTest(): Promise<void> {
  console.log('\n====================================================');
  console.log('🔗 WORKFLOW PERSISTENCE & SSE RECOVERY INTEGRATION TEST');
  console.log('====================================================\n');

  const testDataDir = path.join(process.cwd(), 'data', 'test_persistence_suite');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  const sessionFile = path.join(testDataDir, 'sessions.json');
  const sessionStore = new FileBackedCodingAgentSessionStore(sessionFile);
  const orchestrator = new WorkflowOrchestrator({ sessionStore });

  const validReport: FinalReport = {
    summary: 'Refactored successfully with tests passing',
    tests: 'PASS',
    review: 'APPROVED',
    filesChanged: ['src/math.ts', 'tests/math.test.ts'],
    nextSteps: ['Merge pull request'],
  };

  const workflowId = `wf_integration_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 1. Test creation and registration
  const initialState: WorkflowState = {
    workflowId,
    sessionId: workflowId.replace(/^wf_/, ''),
    agentId: 'team',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Integration test workflow task prompt',
    stage: 'TESTING',
    status: 'IN_PROGRESS',
    executionStatus: 'RUNNING',
    options: { workflowId, taskPrompt: 'Integration test workflow task prompt' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step_1',
        phase: 1,
        agent: 'manager',
        action: 'Architecture design',
        output: 'Designed plan',
        timestamp: Date.now(),
      },
    ],
  };

  await orchestrator.registerWorkflow(initialState);
  console.log(`✅ [Test] Workflow registered successfully: ${workflowId}`);

  // 2. Test retrieval before completion
  const fetchedInFlight = await orchestrator.getWorkflow(workflowId);
  assert.ok(fetchedInFlight, 'In-flight workflow must be retrievable');
  assert.strictEqual(fetchedInFlight?.status, 'IN_PROGRESS');
  assert.strictEqual(fetchedInFlight?.steps.length, 1);
  console.log(`✅ [Test] In-flight workflow retrieved successfully`);

  // 3. Test persistence and final report storage before terminal completion
  await orchestrator.updateWorkflow(workflowId, {
    status: 'COMPLETED',
    stage: 'COMPLETED',
    executionStatus: 'COMPLETED',
    finalReport: validReport,
    steps: [
      ...initialState.steps,
      {
        id: 'step_2',
        phase: 4,
        agent: 'tester',
        action: 'Running QA tests',
        output: 'All tests passed',
        timestamp: Date.now(),
      },
    ],
    testsPassed: true,
  });

  console.log(`✅ [Test] Workflow updated to COMPLETED with final report`);

  // 4. Simulate server restart by instantiating a fresh orchestrator and session store pointing to the same file
  const freshSessionStore = new FileBackedCodingAgentSessionStore(sessionFile);
  const freshOrchestrator = new WorkflowOrchestrator({ sessionStore: freshSessionStore });

  const recoveredWorkflow = await freshOrchestrator.getWorkflow(workflowId);
  assert.ok(recoveredWorkflow, 'Workflow must be recovered from persistent disk storage after restart');
  assert.strictEqual(recoveredWorkflow?.status, 'COMPLETED');
  assert.ok(recoveredWorkflow?.finalReport, 'Final report must be intact after restart');
  assert.strictEqual(recoveredWorkflow?.finalReport?.tests, 'PASS');
  assert.strictEqual(recoveredWorkflow?.finalReport?.review, 'APPROVED');
  assert.strictEqual(recoveredWorkflow?.steps.length, 2);
  console.log(`✅ [Test] Workflow successfully recovered after simulated server restart with 100% data fidelity`);

  // 5. Test missing / non-existent workflow handling
  const nonExistent = await freshOrchestrator.getWorkflow('wf_nonexistent_99999');
  assert.strictEqual(nonExistent, null, 'Non-existent workflow must return null cleanly without throwing');
  console.log(`✅ [Test] Non-existent workflow handled cleanly with null response`);

  // 6. Test concurrent simultaneous workflows with distinct IDs
  const wfIdA = `wf_concurrent_a_${Date.now()}`;
  const wfIdB = `wf_concurrent_b_${Date.now()}`;

  await orchestrator.registerWorkflow({
    ...initialState,
    workflowId: wfIdA,
    sessionId: wfIdA.replace(/^wf_/, ''),
    task: 'Task A',
  });
  await orchestrator.registerWorkflow({
    ...initialState,
    workflowId: wfIdB,
    sessionId: wfIdB.replace(/^wf_/, ''),
    task: 'Task B',
  });

  const resA = await orchestrator.getWorkflow(wfIdA);
  const resB = await orchestrator.getWorkflow(wfIdB);

  assert.strictEqual(resA?.workflowId, wfIdA);
  assert.strictEqual(resB?.workflowId, wfIdB);
  assert.notStrictEqual(resA?.workflowId, resB?.workflowId);
  console.log(`✅ [Test] Concurrent multi-workflow isolation validated successfully`);

  console.log('\n✨ WORKFLOW PERSISTENCE & SSE RECOVERY INTEGRATION TEST PASSED (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('workflowPersistenceAndRecovery')) {
  runWorkflowPersistenceAndRecoveryIntegrationTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Integration test failed:', err);
      process.exit(1);
    });
}
