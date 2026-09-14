import { classifyProviderError, sanitizeErrorMessage } from '../../server/providers/errorClassifier';
import { quotaManager } from '../../server/quotaManager';
import { ProviderManager } from '../../server/providerManager';
import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from '../../server/providers/types';
import { MockProvider } from '../../server/providers/mockProvider';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runErrorClassifierAndFailoverUnitTests() {
  console.log('\n--- [Unit Test] Centralized Error Classification & Failover System ---');

  // 1. RATE_LIMIT classification with retryAfterSeconds
  const rateLimitError = {
    status: 429,
    message: 'Rate limit exceeded: Requests per minute limit reached',
    headers: { 'retry-after': '45' },
  };
  const c1 = classifyProviderError(rateLimitError);
  assert(c1.retryable === true, '429 Rate limit should be retryable');
  assert(c1.reason === 'RATE_LIMIT', '429 Rate limit classified as RATE_LIMIT');
  assert(c1.retryAfterSeconds === 45, 'Parsed retry-after header correctly as 45 seconds');

  // 2. QUOTA classification
  const quotaError = new Error('RESOURCE_EXHAUSTED: You have exceeded your daily quota limit');
  const c2 = classifyProviderError(quotaError);
  assert(c2.retryable === true, 'Quota exhaustion should be retryable via alternative model/provider');
  assert(c2.reason === 'QUOTA', 'Classified as QUOTA');

  // 3. HIGH_DEMAND classification (e.g. 503 spike in demand)
  const highDemandError = new Error('503 UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary.');
  const c3 = classifyProviderError(highDemandError);
  assert(c3.retryable === true, 'High demand 503 is retryable');
  assert(c3.reason === 'HIGH_DEMAND', 'Classified as HIGH_DEMAND');

  // 4. Specifically requested AI Studio error: "Agent execution terminated due to error"
  const aiStudioTerminatedError = new Error('Agent execution terminated due to error');
  const c4 = classifyProviderError(aiStudioTerminatedError);
  assert(c4.retryable === true, 'Agent execution terminated due to error must be classified as retryable');
  assert(c4.reason === 'MODEL_EXECUTION_ERROR', 'Classified as MODEL_EXECUTION_ERROR');

  // 5. AUTHENTICATION error (non-retryable on same provider)
  const authError = {
    status: 401,
    message: 'Unauthorized: Invalid API key provided AIzaSyA123456789012345678901234567890',
  };
  const c5 = classifyProviderError(authError);
  assert(c5.retryable === false, '401 Authentication error is non-retryable on same provider');
  assert(c5.reason === 'AUTHENTICATION', 'Classified as AUTHENTICATION');
  assert(!c5.sanitizedMessage.includes('AIzaSyA1234567890'), 'Sanitizer stripped the Gemini API key');

  // 6. INVALID_REQUEST error (non-retryable)
  const invalidReqError = {
    status: 400,
    message: 'Invalid request: parameter "temperature" must be between 0.0 and 2.0',
  };
  const c6 = classifyProviderError(invalidReqError);
  assert(c6.retryable === false, '400 Invalid request is non-retryable');
  assert(c6.reason === 'INVALID_REQUEST', 'Classified as INVALID_REQUEST');

  // 7. CONFIGURATION error (non-retryable)
  const configError = {
    status: 404,
    message: 'Model not found or unsupported model version: gpt-super-future',
  };
  const c7 = classifyProviderError(configError);
  assert(c7.retryable === false, '404 Model not found is non-retryable configuration issue');
  assert(c7.reason === 'CONFIGURATION', 'Classified as CONFIGURATION');

  // 8. Secret sanitization test
  const dirtySecretMsg = 'Call failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sk-ant-api03-abcdefghijklmnopqrstuvwxyz and gsk_1234567890abcdefghijklmnopqrstuvwxyz and https://api.groq.com/v1?key=AIzaSySecretApiKey123456789012345678';
  const cleanMsg = sanitizeErrorMessage(dirtySecretMsg);
  assert(!cleanMsg.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer JWT token was sanitized');
  assert(!cleanMsg.includes('sk-ant-api03-'), 'Anthropic key was sanitized');
  assert(!cleanMsg.includes('gsk_1234567890'), 'Groq key was sanitized');
  assert(!cleanMsg.includes('AIzaSySecretApiKey'), 'Query param API key was sanitized');

  // 9. QuotaManager handleCooldown test (cooldown preservation rule)
  const testModel = 'test-cooldown-model-' + Date.now();
  quotaManager.handleCooldown(testModel, 120, 'QUOTA');
  assert(quotaManager.isModelInCooldown(testModel) === true, 'Model is in cooldown');
  const remaining1 = quotaManager.getCooldownRemainingSeconds(testModel);
  assert(remaining1 >= 115 && remaining1 <= 120, 'Initial cooldown duration correctly set to ~120s');

  // A shorter cooldown should NOT destroy the existing longer cooldown
  quotaManager.handleCooldown(testModel, 20, 'TEMPORARY_UNAVAILABLE');
  const remaining2 = quotaManager.getCooldownRemainingSeconds(testModel);
  assert(remaining2 > 60, 'Shorter cooldown did not overwrite longer existing cooldown');

  // A longer cooldown SHOULD extend the cooldown
  quotaManager.handleCooldown(testModel, 300, 'RATE_LIMIT');
  const remaining3 = quotaManager.getCooldownRemainingSeconds(testModel);
  assert(remaining3 >= 295 && remaining3 <= 300, 'Longer cooldown successfully extended the cooldown window');

  // 10. Multi-Provider Failover with Non-Retryable Error (Authentication failure on Provider A -> routes to Provider B)
  class BrokenAuthProvider implements IAIProvider {
    public readonly id: AIProviderId = 'openai';
    public readonly name = 'Broken OpenAI Provider';
    public readonly defaultModel = 'gpt-test';
    public readonly sourceType = 'Mock Broken';
    public readonly tokenCounterSupported = true;
    public readonly models: ProviderModelConfig[] = [
      { name: 'gpt-test', displayName: 'GPT Test', contextWindow: 100000, supportsTools: true, costTier: 'pro', providerId: 'openai' },
      { name: 'gpt-test-backup', displayName: 'GPT Backup', contextWindow: 100000, supportsTools: true, costTier: 'pro', providerId: 'openai' },
    ];
    public isConfigured(): boolean { return true; }
    public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
      throw { status: 401, message: 'Invalid OpenAI API key: sk-live12345678901234567890123456' };
    }
    public async countTokens(): Promise<TokenCountResult> { return { tokenCount: 1, isRealProvider: false }; }
  }

  class HermeticGeminiProvider implements IAIProvider {
    public readonly id: AIProviderId = 'gemini';
    public readonly name = 'Hermetic Gemini';
    public readonly defaultModel = 'gemini-test-fallback';
    public readonly sourceType = 'Hermetic';
    public readonly tokenCounterSupported = true;
    public readonly models: ProviderModelConfig[] = [
      { name: 'gemini-test-fallback', displayName: 'Fallback Gemini', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    ];
    public isConfigured(): boolean { return true; }
    public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
      return {
        text: 'Successfully responded via hermetic fallback provider',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        provider: 'gemini',
        model: options.model,
        isRealProviderUsage: true,
        tokenAccountingType: 'real_provider',
      };
    }
    public async countTokens(): Promise<TokenCountResult> { return { tokenCount: 5, isRealProvider: true }; }
  }

  const manager = new ProviderManager();
  const brokenAuth = new BrokenAuthProvider();
  const hermeticGemini = new HermeticGeminiProvider();
  manager.registerProvider(brokenAuth);
  manager.registerProvider(hermeticGemini);

  const failoverRes = await manager.generateWithUsage(
    'gpt-test',
    'Generate test code',
    'Graceful fallback',
    'developer',
    'openai'
  );

  assert(failoverRes.provider === 'gemini', 'Cross-provider failover routed from broken openai to fallback gemini provider');
  assert(Boolean(failoverRes.failoverHistory && failoverRes.failoverHistory.length > 0), 'Failover history captured');
  const rec = failoverRes.failoverHistory![0];
  assert(rec.reason === 'AUTHENTICATION', 'Failover record recorded AUTHENTICATION reason');
  assert(!rec.error.includes('sk-live12345'), 'Failover record error message was sanitized of secrets');

  // 11. Specifically verify "Agent execution terminated due to error" triggers automatic failover
  class TerminatedExecutionProvider implements IAIProvider {
    public readonly id: AIProviderId = 'gemini';
    public readonly name = 'Terminated Mock Provider';
    public readonly defaultModel = 'gemini-term-1';
    public readonly sourceType = 'Mock Terminated';
    public readonly tokenCounterSupported = true;
    public readonly models: ProviderModelConfig[] = [
      { name: 'gemini-term-1', displayName: 'Terminated 1', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
      { name: 'gemini-term-2', displayName: 'Terminated 2', contextWindow: 100000, supportsTools: true, costTier: 'flash', providerId: 'gemini' },
    ];
    public isConfigured(): boolean { return true; }
    public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
      if (options.model === 'gemini-term-1') {
        throw new Error('Agent execution terminated due to error');
      }
      return {
        text: 'Successfully recovered after agent execution terminated error',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        provider: 'gemini',
        model: options.model,
        isRealProviderUsage: true,
        tokenAccountingType: 'real_provider',
      };
    }
    public async countTokens(): Promise<TokenCountResult> { return { tokenCount: 5, isRealProvider: true }; }
  }

  const manager2 = new ProviderManager();
  manager2.registerProvider(new TerminatedExecutionProvider());

  const termRes = await manager2.generateWithUsage(
    'gemini-term-1',
    'Analyze system logs',
    'Fallback text',
    'manager',
    'gemini'
  );

  assert(termRes.model === 'gemini-term-2', 'Recovered from "Agent execution terminated due to error" by failing over to gemini-term-2');
  assert(termRes.text.includes('Successfully recovered'), 'Result contains successful output from secondary model');
  assert(termRes.failoverHistory![0].reason === 'MODEL_EXECUTION_ERROR', 'Failover history categorized reason as MODEL_EXECUTION_ERROR');

  console.log('✅ All Centralized Error Classification & Failover Unit Tests Passed');
}
