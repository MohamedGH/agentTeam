import { runQuotaManagerUnitTests } from './quotaManager.test';
import { runCloudMonitoringUnitTests } from './cloudMonitoring.test';
import { runProvidersUnitTests } from './providers.test';
import { runQuotaAndTokenAccountingUnitTests } from './quotaAndTokenAccounting.test';
import { runCodingAgentsUnitTests } from './codingAgents.test';
import { runGitHubUnitTests } from './github.test';
import { runErrorClassifierAndFailoverUnitTests } from './errorClassifierAndFailover.test';
import { runHardeningVerificationTests } from './hardeningVerification.test';
import { runWorkflowOrchestratorUnitTests } from './workflowOrchestrator.test';
import { runTenRemediationsUnitTests } from './tenRemediations.test';
import { runSelfImprovementUnitTests } from './selfImprovement.test';
import { runAdaptiveLLMUnitTests } from './adaptiveLLM.test';

export async function runAllUnitTests() {
  console.log('====================================================');
  console.log('🧪 Starting Unit Test Suite (Hermetic / Zero LLM Quota)');
  console.log('====================================================');

  await runQuotaManagerUnitTests();
  await runCloudMonitoringUnitTests();
  await runProvidersUnitTests();
  await runQuotaAndTokenAccountingUnitTests();
  await runCodingAgentsUnitTests();
  await runGitHubUnitTests();
  await runErrorClassifierAndFailoverUnitTests();
  await runHardeningVerificationTests();
  await runWorkflowOrchestratorUnitTests();
  await runTenRemediationsUnitTests();
  await runSelfImprovementUnitTests();
  await runAdaptiveLLMUnitTests();

  console.log('\n🎉 ALL UNIT TESTS PASSED (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('runUnitTests')) {
  runAllUnitTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Unit tests failed:', err);
      process.exit(1);
    });
}
