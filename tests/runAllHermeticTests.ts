import { runAllUnitTests } from './unit/runUnitTests';
import { runAllIntegrationTests } from './integration/runIntegrationTests';
import { runWorkflowPipelineE2ETests } from './e2e/workflowPipelineE2E.test';

async function main() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPLETE HERMETIC TEST SUITE (ZERO LLM CALLS)');
  console.log('====================================================\n');

  await runAllUnitTests();
  await runAllIntegrationTests();
  await runWorkflowPipelineE2ETests();

  console.log('====================================================');
  console.log('✨ ALL HERMETIC TESTS (UNIT + INTEGRATION + E2E) PASSED 100%');
  console.log('====================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test suite encountered an error:', err);
  process.exit(1);
});
