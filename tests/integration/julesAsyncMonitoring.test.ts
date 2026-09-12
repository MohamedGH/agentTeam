import assert from 'assert';
import { codingAgentManager } from '../../server/codingAgents/codingAgentManager';

export async function runJulesAsyncMonitoringIntegrationTests() {
  console.log('\n--- [Integration Test] Asynchronous Observable Jules Monitoring & Lifecycle ---');

  // 1. Start an asynchronous session with requirePlanApproval = true
  const startTime = Date.now();
  const session = await codingAgentManager.startSession({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Upgrade error telemetry and implement exponential backoff in providers',
    title: 'Provider Telemetry & Backoff',
    automationMode: 'AUTO_CREATE_PR',
    requirePlanApproval: true,
  });

  const durationMs = Date.now() - startTime;
  assert.ok(durationMs < 100, `startSession must return immediately without waiting for execution (took ${durationMs}ms)`);
  assert.ok(session.id, 'Session must have a valid ID');
  assert.strictEqual(session.state, 'AWAITING_PLAN_APPROVAL');
  console.log(`✅ PASS: Non-blocking session started in ${durationMs}ms (State: ${session.state})`);

  // 2. Fetch session details using sessionId
  const fetchedSession = await codingAgentManager.getSession(session.id);
  assert.strictEqual(fetchedSession.id, session.id);
  assert.strictEqual(fetchedSession.state, 'AWAITING_PLAN_APPROVAL');
  console.log('✅ PASS: getSession retrieves session by sessionId');

  // 3. List initial activities
  const initialActivities = await codingAgentManager.listActivities(session.id);
  assert.ok(initialActivities.length >= 2, 'Should contain planning and approval required activities');
  const planReq = initialActivities.find((a) => a.actionType === 'PLAN_APPROVAL_REQUIRED');
  assert.ok(planReq, 'Must contain PLAN_APPROVAL_REQUIRED activity');
  console.log('✅ PASS: listActivities returns initial planning activities');

  // 4. Send an interactive message / clarification to Jules
  await codingAgentManager.sendMessage(
    session.id,
    'Ensure backoff includes ±20% randomized jitter to prevent thundering herd'
  );
  const activitiesAfterMsg = await codingAgentManager.listActivities(session.id);
  const userMsg = activitiesAfterMsg.find((a) => a.originator === 'USER');
  const agentAck = activitiesAfterMsg.find((a) => a.actionType === 'AGENT_REPLY');
  assert.ok(userMsg, 'User message activity must be present in activities stream');
  assert.ok(agentAck, 'Agent acknowledgment activity must be present in activities stream');
  assert.ok(agentAck.description?.includes('randomized jitter'), 'Agent reply acknowledges message content');
  console.log('✅ PASS: In-session messaging recorded and acknowledged by Jules agent');

  // 5. Approve the pending plan
  await codingAgentManager.approvePlan(session.id);
  const sessionAfterApproval = await codingAgentManager.getSession(session.id);
  assert.strictEqual(sessionAfterApproval.state, 'COMPLETED');
  assert.ok(sessionAfterApproval.prUrl, 'Pull Request URL must be generated after plan approval');
  console.log(`✅ PASS: approvePlan transitions state to COMPLETED and creates PR (${sessionAfterApproval.prUrl})`);

  // 6. Verify full chronological activity stream
  const finalActivities = await codingAgentManager.listActivities(session.id);
  const planApprovedAct = finalActivities.find((a) => a.actionType === 'PLAN_APPROVED');
  const prCreatedAct = finalActivities.find((a) => a.actionType === 'CREATE_PR');
  assert.ok(planApprovedAct, 'Must contain PLAN_APPROVED activity');
  assert.ok(prCreatedAct, 'Must contain CREATE_PR activity with PR URL');
  assert.strictEqual(prCreatedAct.prUrl, sessionAfterApproval.prUrl);
  console.log('✅ PASS: Complete observable activity stream verified from planning to PR creation');

  // 7. Long-running session simulation (>120s timeout tolerance)
  // Verify that an execution wait window expiring does NOT mark session as failed
  const longRunningSession = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Long running simulation',
    timeoutSeconds: 0, // Request immediate non-blocking return
  });
  assert.ok(longRunningSession.sessionId);
  assert.notStrictEqual(longRunningSession.status, 'FAILED');
  assert.strictEqual(longRunningSession.error, undefined);
  console.log('✅ PASS: Jules long-running task tolerance verified: session is never failed simply due to wait window');

  console.log('✅ All Jules Asynchronous Monitoring Integration Tests Passed');
}
