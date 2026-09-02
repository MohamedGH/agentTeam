import { quotaManager } from '../../server/quotaManager';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runQuotaManagerUnitTests() {
  console.log('\n--- [Unit Test] Quota Manager Dynamic Limits & Cooldowns ---');

  // 1. Reset state
  quotaManager.resetState();
  const initialStatus = quotaManager.allStatus('tier_3');
  assert(initialStatus !== null, 'allStatus returns a valid dictionary');

  // 2. Test dynamic usage recording
  const testModel = 'gemini-3.7-flash';
  quotaManager.recordUsage(testModel, { totalTokenCount: 1500 });
  const statusAfter1 = quotaManager.allStatus('tier_3')[testModel];
  assert(statusAfter1.rpm_used === 1, `RPM used is 1 (actual: ${statusAfter1.rpm_used})`);
  assert(statusAfter1.tpm_used === 1500, `TPM used is 1500 (actual: ${statusAfter1.tpm_used})`);
  assert(statusAfter1.rpd_used === 1, `RPD used is 1 (actual: ${statusAfter1.rpd_used})`);

  // 3. Test 429 Rate Limit Cooldown Handling
  quotaManager.handle429Error(testModel, 45);
  assert(quotaManager.isModelInCooldown(testModel) === true, 'Model is in cooldown after 429 error');
  const check = quotaManager.canUseModel(testModel, 'tier_3');
  assert(check.ok === false, 'canUseModel returns false when cooldown is active');
  assert(check.reason.includes('Cooldown active'), 'canUseModel explains cooldown in reason');

  // 4. Test 503 High Demand Cooldown Handling
  const testModel2 = 'gemini-3.6-flash';
  quotaManager.handle503Error(testModel2, 30);
  assert(quotaManager.isModelInCooldown(testModel2) === true, 'Model is in cooldown after 503 error');

  // 5. Model Selection with Headroom
  const availableModel = 'gemini-3.5-flash';
  quotaManager.resetState(availableModel);
  const best = quotaManager.selectBestModel([testModel, testModel2, availableModel], 'tier_3');
  assert(best === availableModel, `selectBestModel skips models in cooldown and selects available candidate (${best})`);

  // 6. Reset single model
  quotaManager.resetState(testModel);
  assert(quotaManager.isModelInCooldown(testModel) === false, 'Resetting model clears cooldown state');

  console.log('✅ QuotaManager Unit Tests Passed');
}
