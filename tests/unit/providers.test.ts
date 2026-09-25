import { providerManager, ProviderManager } from '../../server/providerManager';
import { GeminiProvider } from '../../server/providers/geminiProvider';
import { OpenAIProvider } from '../../server/providers/openaiProvider';
import { AnthropicProvider } from '../../server/providers/anthropicProvider';
import { GroqProvider, DeepSeekProvider, CustomProvider } from '../../server/providers/otherProviders';
import { MockProvider } from '../../server/providers/mockProvider';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runProvidersUnitTests() {
  console.log('\n--- [Unit Test] Unified AI Provider Interface & activeModelOverride ---');

  // 1. Verify all providers implement IAIProvider correctly
  const providers = [
    new GeminiProvider(),
    new OpenAIProvider(),
    new AnthropicProvider(),
    new GroqProvider(),
    new DeepSeekProvider(),
    new CustomProvider(),
    new MockProvider(),
  ];

  for (const p of providers) {
    assert(typeof p.id === 'string', `Provider ${p.name} has id: ${p.id}`);
    assert(typeof p.name === 'string', `Provider ${p.id} has name: ${p.name}`);
    assert(typeof p.defaultModel === 'string', `Provider ${p.id} has defaultModel: ${p.defaultModel}`);
    assert(Array.isArray(p.models) && p.models.length > 0, `Provider ${p.id} has models list`);
    assert(typeof p.isConfigured === 'function', `Provider ${p.id} has isConfigured()`);
    assert(typeof p.generateContent === 'function', `Provider ${p.id} has generateContent()`);
    assert(typeof p.countTokens === 'function', `Provider ${p.id} has countTokens()`);
  }

  // 2. Test activeModelOverride management
  providerManager.clearAllModelOverrides();
  assert(providerManager.getModelOverride('gemini') === null, 'No initial override');

  providerManager.setModelOverride('gemini', 'gemini-3.1-pro-preview');
  assert(providerManager.getModelOverride('gemini') === 'gemini-3.1-pro-preview', 'Model override set for Gemini');

  const selectedWithOverride = await providerManager.selectOptimalModel(undefined, 'tier_3', 1000, 'gemini');
  assert(selectedWithOverride === 'gemini-3.1-pro-preview', 'selectOptimalModel respects activeModelOverride');

  // When override model is put in cooldown, selectOptimalModel automatically falls back
  providerManager.handleRateLimitError('gemini-3.1-pro-preview', 30);
  const fallbackSelection = await providerManager.selectOptimalModel(['gemini-3.7-flash', 'gemini-3.6-flash'], 'tier_3', 1000, 'gemini');
  assert(fallbackSelection !== 'gemini-3.1-pro-preview', 'selectOptimalModel does not get stuck on an overridden model in cooldown');

  // Reset override
  providerManager.setModelOverride('gemini', null);
  assert(providerManager.getModelOverride('gemini') === null, 'Override cleared');

  console.log('✅ Providers & activeModelOverride Unit Tests Passed');
}
