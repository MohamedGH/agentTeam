import { quotaManager } from '../../server/quotaManager';
import { providerManager } from '../../server/providerManager';
import { cloudMonitoringQuotaService } from '../../server/cloudMonitoring';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

export async function runQuotaAndTokenAccountingUnitTests() {
  console.log('\n--- [Unit Test] Quota Manager Fallback Isolation & Token Accounting ---');
  // Test 1: Fallback tokens are 0/unknown and NOT recorded in quotaManager
  // Put all registered provider models in cooldown so fallback is triggered deterministically and hermetically
  const allProviders = providerManager.getProvidersList();
  const allModels: string[] = ['unconfigured-model-test'];
  for (const p of allProviders) {
    for (const m of p.models) {
      allModels.push(m.name);
    }
  }

  for (const m of allModels) {
    quotaManager.handle429Error(m, 60);
  }

  const fallbackResult = await providerManager.generateWithUsage(
    'unconfigured-model-test',
    'Hello world test prompt',
    'Fallback generated text response',
    'developer',
    'custom' // unconfigured
  );

  assert(fallbackResult.isRealProviderUsage === false, 'isRealProviderUsage is false for unconfigured fallback');
  assert(fallbackResult.tokenAccountingType === 'fallback_unknown', 'tokenAccountingType is fallback_unknown');
  assert(fallbackResult.totalTokens === 0, 'Fallback totalTokens is 0 (not estimated)');
  assert(fallbackResult.promptTokens === 0, 'Fallback promptTokens is 0');
  assert(fallbackResult.completionTokens === 0, 'Fallback completionTokens is 0');

  const status = quotaManager.allStatus('tier_3');
  const modelStatus = status['unconfigured-model-test'];
  assert(!modelStatus || modelStatus.rpm_used === 0, 'QuotaManager did not record fake RPM usage for fallback');
  assert(!modelStatus || modelStatus.tpm_used === 0, 'QuotaManager did not record fake TPM usage for fallback');

  // Clear cooldowns
  for (const m of allModels) {
    quotaManager.resetState(m);
  }

  // Test 2: Authoritative vs Fallback Quota Source Tagging
  quotaManager.registerLimits('gemini-3.7-flash', {
    tier_3: { rpm: 6000, tpm: 4000000, rpd: 10000, isAuthoritative: false, quotaSource: 'offline_fallback' },
  });

  const refStatus = quotaManager.allStatus('tier_3')['gemini-3.7-flash'];
  assert(refStatus.isAuthoritative === false, 'Offline reference limits are flagged isAuthoritative: false');
  assert(refStatus.quotaSource === 'offline_fallback', 'quotaSource is tagged as offline_fallback');
  assert(refStatus.quotaSourceLabel.includes('Advisory'), 'quotaSourceLabel describes advisory reference');

  // Test 3: TPM, RPM, RPD remaining calculations
  quotaManager.recordUsage('gemini-3.7-flash', { totalTokenCount: 50000 });
  const remaining = quotaManager.getRemainingQuota('gemini-3.7-flash', 'tier_3');
  assert(remaining.remaining_rpm === 5999, 'remaining_rpm accurately reflects (6000 - 1 = 5999)');
  assert(remaining.remaining_tpm === 3950000, 'remaining_tpm accurately reflects (4000000 - 50000 = 3950000)');
  assert(remaining.remaining_rpd === 9999, 'remaining_rpd accurately reflects (10000 - 1 = 9999)');

  console.log('✅ Fallback Isolation & Token Accounting Unit Tests Passed');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('quotaAndTokenAccounting')) {
  runQuotaAndTokenAccountingUnitTests().catch((e) => {
    console.error('Test execution failed:', e);
    process.exit(1);
  });
}
