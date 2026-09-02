import { runQuotaManagerUnitTests } from './quotaManager.test';
import { runCloudMonitoringUnitTests } from './cloudMonitoring.test';
import { runProvidersUnitTests } from './providers.test';

export async function runAllUnitTests() {
  console.log('====================================================');
  console.log('🧪 Starting Unit Test Suite (Hermetic / Zero LLM Quota)');
  console.log('====================================================');

  await runQuotaManagerUnitTests();
  await runCloudMonitoringUnitTests();
  await runProvidersUnitTests();

  console.log('\n🎉 ALL UNIT TESTS PASSED (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('runUnitTests')) {
  runAllUnitTests().catch((err) => {
    console.error('Unit tests failed:', err);
    process.exit(1);
  });
}
