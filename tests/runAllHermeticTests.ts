import { runAllUnitTests } from './unit/runUnitTests';
import { runAllIntegrationTests } from './integration/runIntegrationTests';

async function main() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPLETE HERMETIC TEST SUITE (ZERO LLM CALLS)');
  console.log('====================================================\n');

  await runAllUnitTests();
  await runAllIntegrationTests();

  console.log('====================================================');
  console.log('✨ ALL HERMETIC TESTS (UNIT + INTEGRATION) PASSED 100%');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Test suite encountered an error:', err);
  process.exit(1);
});
