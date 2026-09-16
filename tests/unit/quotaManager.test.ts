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

  // 7. Multi-provider isolation: Non-Gemini models not blocked by Gemini quota
  // Put gemini model in cooldown
  quotaManager.handle429Error('gemini-2.5-flash', 60);
  assert(quotaManager.canUseModel('gemini-2.5-flash').ok === false, 'Gemini model is blocked under cooldown');

  // Verify non-Gemini models: OpenAI, Anthropic, Groq, DeepSeek, Custom, Mock
  assert(quotaManager.canUseModel('gpt-4o').ok === true, 'OpenAI model is NOT blocked by Gemini quota');
  assert(quotaManager.canUseModel('claude-3-5-sonnet-20241022').ok === true, 'Anthropic model is NOT blocked by Gemini quota');
  assert(quotaManager.canUseModel('llama-3.3-70b-versatile').ok === true, 'Groq model is NOT blocked by Gemini quota');
  assert(quotaManager.canUseModel('deepseek-chat').ok === true, 'DeepSeek model is NOT blocked by Gemini quota');
  assert(quotaManager.canUseModel('custom-model-1').ok === true, 'Custom model is NOT blocked by Gemini quota');
  assert(quotaManager.canUseModel('mock-model').ok === true, 'Mock model is NOT blocked by Gemini quota');

  // 8. Explicit cooldown on non-Gemini model is still strictly respected
  quotaManager.handleCooldown('gpt-4o', 60, 'RATE_LIMIT');
  assert(quotaManager.canUseModel('gpt-4o').ok === false, 'OpenAI model respects its own explicit cooldown');
  assert(quotaManager.canUseModel('claude-3-5-sonnet-20241022').ok === true, 'Other providers remain available when OpenAI is in cooldown');
  quotaManager.resetState('gpt-4o');
  quotaManager.resetState('gemini-2.5-flash');

  console.log('✅ QuotaManager Unit Tests Passed');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('quotaManager.test')) {
  runQuotaManagerUnitTests().catch((err) => {
    console.error('QuotaManager unit test failed:', err);
    process.exit(1);
  });
}
