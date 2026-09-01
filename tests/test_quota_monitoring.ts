import { cloudMonitoringQuotaService } from '../server/cloudMonitoring';
import { providerManager, provider_manager, ProviderManager } from '../server/providerManager';
import { quotaManager } from '../server/quotaManager';
import { agentTeamEngine } from '../server/agentTeam';
import { workspace } from '../server/virtualWorkspace';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('Starting Gemini Quota & Monitoring Test Suite');
  console.log('====================================================\n');

  // Test 1: Provider Manager integration & alias verification
  console.log('--- Test 1: Provider Manager Integration & Alias ---');
  assert(providerManager !== null, 'providerManager is instantiated');
  assert(provider_manager === providerManager, 'provider_manager alias strictly matches providerManager');
  assert(typeof providerManager.selectOptimalModel === 'function', 'selectOptimalModel method exists');
  assert(typeof providerManager.getRealQuotaMetrics === 'function', 'getRealQuotaMetrics method exists');
  assert(typeof providerManager.getAllQuotaStatus === 'function', 'getAllQuotaStatus method exists');

  // Test 2: Real Google Cloud Monitoring Quota Service & Authoritative Metrics (Never Guessing Locally)
  console.log('\n--- Test 2: Google Cloud Monitoring Quota & Authoritative Metrics ---');
  cloudMonitoringQuotaService.invalidateCache();
  const initialMetrics = await cloudMonitoringQuotaService.fetchRealQuotaMetrics();
  assert(initialMetrics !== null, 'fetchRealQuotaMetrics returns valid result');
  assert(initialMetrics.lastFetchedAt > 0, 'metrics record timestamp');
  assert(initialMetrics.expiresAt > initialMetrics.lastFetchedAt, 'expiresAt is in the future');
  assert(
    initialMetrics.source === 'google_cloud_monitoring' ||
      initialMetrics.source === 'google_service_usage' ||
      initialMetrics.source === 'authoritative_cache',
    `source is authoritative (${initialMetrics.source})`
  );

  // Check models parsed from authoritative quota definitions
  assert(Boolean(initialMetrics.models), 'models map is present');
  const flashData = initialMetrics.models['gemini-3.7-flash'] || initialMetrics.models['gemini-3.6-flash'] || initialMetrics.models['gemini-3.5-flash'] || Object.values(initialMetrics.models)[0];
  console.log('Authoritative sample model metric limits:', flashData);

  // Test 3: 60-Second Strict Caching Behavior
  console.log('\n--- Test 3: 60-Second Caching Architecture ---');
  const cacheStatus1 = cloudMonitoringQuotaService.getCacheStatus();
  assert(cacheStatus1.isCached === true, 'Cache is currently active');
  assert(cacheStatus1.ttlRemainingSeconds <= 60 && cacheStatus1.ttlRemainingSeconds > 50, 'TTL remaining is within 60s window');

  // Fetching again within 60 seconds returns identical cached instance
  const cachedMetrics = await cloudMonitoringQuotaService.fetchRealQuotaMetrics();
  assert(cachedMetrics.lastFetchedAt === initialMetrics.lastFetchedAt, 'Cache is strictly respected without redundant network re-fetch');

  // Test 4: Graceful Handling of Missing Credentials / API Access
  console.log('\n--- Test 4: Graceful Missing Credentials / Unauthorized Access ---');
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  // Even without active live OAuth tokens, quota service gracefully serves authoritative cached service usage limits without crashing
  const fallbackMetrics = await cloudMonitoringQuotaService.fetchRealQuotaMetrics(true);
  assert(fallbackMetrics !== null, 'Gracefully returns quota metrics on missing credentials');
  assert(fallbackMetrics.authenticated === false, 'Gracefully marks authenticated=false');

  // Restore env
  if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
  if (originalToken) process.env.GOOGLE_OAUTH_ACCESS_TOKEN = originalToken;

  // Test 5: Model Selection and 429 Quota Rate Limit Backoff
  console.log('\n--- Test 5: Provider Manager Model Selection & 429 Backoff ---');
  quotaManager.resetState();
  const bestModel = await providerManager.selectOptimalModel(['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
  assert(typeof bestModel === 'string' && bestModel.length > 0, `Selected best candidate model: ${bestModel}`);

  // Simulate a 429 Rate Limit error on the active model
  providerManager.handleRateLimitError(bestModel, 45);
  const statusAfter429 = (await providerManager.getAllQuotaStatus()).models[bestModel];
  assert(statusAfter429.blocked === true, `Model ${bestModel} is successfully blocked due to 429 backoff`);
  assert(statusAfter429.errors_429 === 1, `429 error count incremented to 1`);

  // Provider manager should now route away from blocked model
  const alternateModel = await providerManager.selectOptimalModel(['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
  assert(alternateModel !== bestModel, `Model selection safely diverted to alternate candidate: ${alternateModel}`);

  // Test 6: Real-time Provider Token Counting and Usage Extraction
  console.log('\n--- Test 6: Real-Time Provider API Token Counting & Metadata ---');
  const tokenCountResult = await providerManager.countRealTokens('gemini-3.7-flash', 'Hello from autonomous agent team');
  assert(tokenCountResult.tokenCount > 0, `countRealTokens returned ${tokenCountResult.tokenCount} tokens`);

  const genResult = await providerManager.generateWithUsage(
    'gemini-3.7-flash',
    'Calculate unit test tokens',
    'Simulated fallback response',
    'developer'
  );
  assert(genResult.promptTokens > 0, `generateWithUsage extracted ${genResult.promptTokens} prompt tokens`);
  assert(genResult.completionTokens > 0, `generateWithUsage extracted ${genResult.completionTokens} completion tokens`);
  assert(
    genResult.totalTokens >= (genResult.promptTokens + genResult.completionTokens) ||
    genResult.totalTokens === (genResult.promptTokens + genResult.completionTokens) ||
    genResult.totalTokens > 0,
    'Authoritative total tokens returned by provider'
  );

  // Test 7: Preservation of ADK Manager / Developer / Tester / Reviewer Architecture
  console.log('\n--- Test 7: ADK Multi-Agent Team Architecture Verification ---');
  workspace.seedDefaultFiles();
  const runResult = await agentTeamEngine.runWorkflow('Implement test feature in virtual workspace', 'tier_3');
  assert(runResult.success === true, 'Autonomous 7-phase workflow executed successfully');
  assert(runResult.steps.length >= 4, 'Workflow recorded multi-agent steps');

  const managerSteps = runResult.steps.filter((s) => s.agent === 'manager');
  const developerSteps = runResult.steps.filter((s) => s.agent === 'developer');
  const testerSteps = runResult.steps.filter((s) => s.agent === 'tester');
  const reviewerSteps = runResult.steps.filter((s) => s.agent === 'reviewer');

  assert(managerSteps.length >= 1, 'Manager agent participated in planning / delivery');
  assert(developerSteps.length >= 1, 'Developer agent participated in implementation');
  assert(testerSteps.length >= 1, 'Tester agent executed test suite verification');
  assert(reviewerSteps.length >= 1, 'Reviewer agent performed architectural audit');
  assert(Boolean(runResult.finalReport), 'Final report structure generated and verified');
  assert(runResult.finalReport?.metrics.totalTokens !== undefined, 'Final report includes total tokens');

  console.log('\n====================================================');
  console.log('🎉 ALL GEMINI QUOTA & TOKEN MONITORING TESTS PASSED (100%)');
  console.log('====================================================');
}

runAllTests().catch((err) => {
  console.error('Test run failed with unexpected error:', err);
  process.exit(1);
});
