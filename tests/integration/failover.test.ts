import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { quotaManager } from '../../server/quotaManager';
import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from '../../server/providers/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// A test provider that simulates 503 on first model, then succeeds on second model
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
      text: `Successfully generated via model: ${options.model}`,
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
      provider: 'gemini',
      model: options.model,
      isRealProviderUsage: true,
      tokenAccountingType: 'real_provider',
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: 10, isRealProvider: true };
  }
}

// Provider simulating AI Studio "Agent execution terminated due to error"
class TerminatedTestProvider implements IAIProvider {
  public readonly id: AIProviderId = 'anthropic';
  public readonly name = 'Anthropic Terminated Provider';
  public readonly defaultModel = 'claude-term-primary';
  public readonly sourceType = 'Test Mock';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'claude-term-primary', displayName: 'Claude Term Primary', contextWindow: 100000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
    { name: 'claude-term-backup', displayName: 'Claude Term Backup', contextWindow: 100000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
  ];

  public isConfigured(): boolean {
    return true;
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    if (options.model === 'claude-term-primary') {
      throw new Error('Agent execution terminated due to error');
    }
    return {
      text: `Successfully recovered via: ${options.model}`,
      promptTokens: 12,
      completionTokens: 18,
      totalTokens: 30,
      provider: 'anthropic',
      model: options.model,
      isRealProviderUsage: true,
      tokenAccountingType: 'real_provider',
    };
  }

  public async countTokens(): Promise<TokenCountResult> {
    return { tokenCount: 8, isRealProvider: true };
  }
}

// Provider for multi-hop failure chain
class MultiHopTestProvider implements IAIProvider {
  public readonly id: AIProviderId = 'groq';
  public readonly name = 'MultiHop Test Provider';
  public readonly defaultModel = 'hop-1';
  public readonly sourceType = 'Test Mock';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'hop-1', displayName: 'Hop 1', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
    { name: 'hop-2', displayName: 'Hop 2', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
    { name: 'hop-3', displayName: 'Hop 3', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
  ];

  public isConfigured(): boolean {
    return true;
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    if (options.model === 'hop-1') {
      throw new Error('503 UNAVAILABLE: Model hop 1 overloaded');
    }
    if (options.model === 'hop-2') {
      throw new Error('429 Rate limit: too many requests per minute with key AIzaSyTestKey123456789012345678');
    }
    return {
      text: `Successfully generated via model: ${options.model}`,
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
      provider: 'groq',
      model: options.model,
      isRealProviderUsage: true,
      tokenAccountingType: 'real_provider',
    };
  }

  public async countTokens(): Promise<TokenCountResult> {
    return { tokenCount: 10, isRealProvider: true };
  }
}

export async function runFailoverIntegrationTests() {
  console.log('\n--- [Integration Test] Automatic Multi-Model & Multi-Provider Failover ---');

  quotaManager.resetState();

  const customManager = new ProviderManager();
  const testProvider = new FailoverTestProvider();
  customManager.registerProvider(testProvider);

  // 1. Test intra-provider failover when primary model throws 503
  const res1 = await customManager.generateWithUsage(
    'test-primary',
    'Write a sorting function',
    'Fallback text',
    'developer',
    'gemini'
  );

  assert(res1.text.includes('test-secondary'), 'Failover caught 503 and routed to secondary candidate model');
  assert(res1.model === 'test-secondary', `Model switched from test-primary to ${res1.model}`);
  assert(Boolean(res1.failoverHistory && res1.failoverHistory.length === 1), 'Failover history recorded exactly 1 event');
  assert(res1.failoverHistory![0].reason === 'HIGH_DEMAND', 'Failover record reason is HIGH_DEMAND');

  // 2. Test AI Studio "Agent execution terminated due to error" automatic failover
  const termProvider = new TerminatedTestProvider();
  customManager.registerProvider(termProvider);

  const res2 = await customManager.generateWithUsage(
    'claude-term-primary',
    'Execute architecture review',
    'Fallback text',
    'architect',
    'anthropic'
  );

  assert(res2.text.includes('claude-term-backup'), 'Successfully recovered from "Agent execution terminated due to error"');
  assert(res2.model === 'claude-term-backup', `Switched from claude-term-primary to ${res2.model}`);
  assert(res2.failoverHistory![0].reason === 'MODEL_EXECUTION_ERROR', 'Failover categorized as MODEL_EXECUTION_ERROR');

  // 3. Test multi-hop failover chain (Hop 1 fails 503 -> Hop 2 fails 429 -> Hop 3 succeeds)
  const hopProvider = new MultiHopTestProvider();
  customManager.registerProvider(hopProvider);

  const res3 = await customManager.generateWithUsage(
    'hop-1',
    'Write a distributed consensus algorithm',
    'Fallback text',
    'developer',
    'groq'
  );

  assert(res3.model === 'hop-3', `Multi-hop failover reached hop-3 after 2 consecutive model errors (got ${res3.model})`);
  assert(res3.failoverHistory!.length === 2, `Recorded 2 failover events, got: ${res3.failoverHistory!.length}`);
  assert(res3.failoverHistory![0].reason === 'HIGH_DEMAND', 'First failover event was HIGH_DEMAND');
  assert(res3.failoverHistory![1].reason === 'RATE_LIMIT', 'Second failover event was RATE_LIMIT');
  assert(!res3.failoverHistory![1].error.includes('AIzaSyTestKey'), 'API key in 429 error message was fully redacted');

  console.log('✅ Failover Integration Tests Passed (100%)');
}
