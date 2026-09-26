import { agentTeamEngine } from '../../server/agentTeam';
import { workspace } from '../../server/virtualWorkspace';
import { providerManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runAgentTeamIntegrationTests() {
  console.log('\n--- [Integration Test] Hermetic Multi-Agent Team Execution (Zero Quota LLM) ---');

  // Register mock provider for hermetic execution
  const mockProvider = new MockProvider();
  mockProvider.mockTextOverride = 'Hermetic test step execution output verifying clean architecture.';
  providerManager.registerProvider(mockProvider);
  providerManager.setActiveProvider('mock');

  workspace.seedDefaultFiles();

  const runResult = await agentTeamEngine.runWorkflow(
    'Implement secure JWT auth token validation with unit tests',
    'tier_3',
    undefined,
    { provider: 'mock', model: 'mock-fast-model' }
  );

  assert(runResult.success === true, 'Workflow completed with success=true');
  assert(runResult.steps.length >= 4, `Workflow captured ${runResult.steps.length} multi-agent steps`);

  // Verify participation of all 4 ADK agents across the phases
  const managerSteps = runResult.steps.filter((s) => s.agent === 'manager');
  const developerSteps = runResult.steps.filter((s) => s.agent === 'developer');
  const testerSteps = runResult.steps.filter((s) => s.agent === 'tester');
  const reviewerSteps = runResult.steps.filter((s) => s.agent === 'reviewer');

  assert(managerSteps.length >= 2, 'Manager executed Analysis and Final Delivery phases');
  assert(developerSteps.length >= 1, 'Developer executed Implementation with tool calls');
  assert(testerSteps.length >= 1, 'Tester executed test suite validation');
  assert(reviewerSteps.length >= 1, 'Reviewer executed architectural audit');

  // Verify Virtual Workspace modifications
  const files = workspace.getFiles();
  assert(Boolean(files['src/auth.py']), 'src/auth.py was created in workspace');
  assert(Boolean(files['tests/test_auth.py']), 'tests/test_auth.py was created in workspace');

  // Verify Final Report
  assert(Boolean(runResult.finalReport), 'Final report structure is present');
  assert(runResult.finalReport?.implementation === 'PASS', 'Implementation status is PASS');
  assert(runResult.finalReport?.tests === 'PASS', 'Tests status is PASS');
  assert(runResult.finalReport?.review === 'APPROVED', 'Review status is APPROVED');
  assert(runResult.finalReport?.metrics.totalTokens !== undefined && runResult.finalReport.metrics.totalTokens > 0, 'Total tokens tracked');

  // Test Gate Failure Invariant: If reviewer flags blocking issues or tester fails, runWorkflow MUST return success=false
  console.log('\n--- [Integration Test] Gate Failure Enforcement ---');
  mockProvider.mockTextOverride = 'CRITICAL ISSUE: changes requested, security regression detected.';
  const failedReviewResult = await agentTeamEngine.runWorkflow(
    'Refactor auth with insecure patterns',
    'tier_3',
    undefined,
    { provider: 'mock', model: 'mock-fast-model' }
  );
  assert(failedReviewResult.success === false, 'Workflow with reviewer rejection returns success=false');
  assert(failedReviewResult.executionStatus === 'FAILED', 'Workflow with reviewer rejection sets executionStatus=FAILED');
  assert(failedReviewResult.finalReport?.implementation === 'FAIL', 'Implementation is marked FAIL on gate failure');
  assert(failedReviewResult.finalReport?.review === 'CHANGES_REQUIRED', 'Review report reflects CHANGES_REQUIRED');

  // Reset provider back to Gemini
  mockProvider.mockTextOverride = undefined;
  providerManager.setActiveProvider('gemini');

  console.log('✅ Agent Team Hermetic Integration Tests Passed');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('agentTeam.test')) {
  runAgentTeamIntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Agent Team integration test failed:', err);
      process.exit(1);
    });
}
