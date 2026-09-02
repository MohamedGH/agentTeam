import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from '../../server/providers/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// A test provider that simulates a 503 error on first model, then succeeds on second model
class FailoverTestProvider implements IAIProvider {
  public readonly id: AIProviderId = 'gemini';
  public readonly name = 'Failover Test Provider';
  public readonly defaultModel = 'test-primary';
  public readonly sourceType = 'Test Mock';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'test-primary', displayName: 'Primary Model', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    { name: 'test-secondary', displayName: 'Secondary Model', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
  ];

  public isConfigured(): boolean {
    return true;
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    if (options.model === 'test-primary') {
      throw new Error('503 UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary.');
    }

    return {
      text: `Successfully generated via secondary model: ${options.model}`,
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
      provider: 'gemini',
      model: options.model,
      isRealProviderUsage: true,
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: 10, isRealProvider: true };
  }
}

export async function runFailoverIntegrationTests() {
  console.log('\n--- [Integration Test] Automatic Multi-Model & Multi-Provider Failover ---');

  const customManager = new ProviderManager();
  const testProvider = new FailoverTestProvider();
  customManager.registerProvider(testProvider);

  // 1. Test intra-provider failover when primary model throws 503
  const res = await customManager.generateWithUsage(
    'test-primary',
    'Write a sorting function',
    'Fallback text',
    'developer',
    'gemini'
  );

  assert(res.text.includes('secondary model'), 'Failover caught 503 and routed to secondary candidate model');
  assert(res.model === 'test-secondary', `Model switched from test-primary to ${res.model}`);
  assert(Boolean(res.failoverHistory && res.failoverHistory.length > 0), 'Failover history recorded the 503 event');
  console.log('Recorded failover chain history:', res.failoverHistory);

  // 2. Test cross-provider failover to MockProvider
  const mockProvider = new MockProvider();
  customManager.registerProvider(mockProvider);

  console.log('✅ Failover Integration Tests Passed');
}
