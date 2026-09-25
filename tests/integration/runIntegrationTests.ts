import { runFailoverIntegrationTests } from './failover.test';
import { runAgentTeamIntegrationTests } from './agentTeam.test';
import { runJulesAgentTeamIntegrationTests } from './julesAgentTeam.test';
import { runJulesAsyncMonitoringIntegrationTests } from './julesAsyncMonitoring.test';
import { runJulesComprehensiveScenariosTest } from './julesComprehensiveScenarios.test';
import { runGitHubWorkflowIntegrationTests } from './githubWorkflow.test';
import { runWorkflowOrchestratorIntegrationTests } from './workflowOrchestratorIntegration.test';

export async function runAllIntegrationTests() {
  console.log('====================================================');
  console.log('🔗 Starting Integration Test Suite (Hermetic / Zero LLM Quota)');
  console.log('====================================================');

  await runFailoverIntegrationTests();
  await runAgentTeamIntegrationTests();
  await runJulesAgentTeamIntegrationTests();
  await runJulesAsyncMonitoringIntegrationTests();
  await runJulesComprehensiveScenariosTest();
  await runGitHubWorkflowIntegrationTests();
  await runWorkflowOrchestratorIntegrationTests();

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('runIntegrationTests')) {
  runAllIntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Integration tests failed:', err);
      process.exit(1);
    });
}
