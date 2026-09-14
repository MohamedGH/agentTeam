import assert from 'assert';
import { ProviderManager } from '../../server/providerManager';
import { quotaManager } from '../../server/quotaManager';
import {
  IAIProvider,
  AIProviderId,
  ProviderModelConfig,
  GenerateOptions,
  GenerationUsageResult,
  TokenCountResult,
} from '../../server/providers/types';
import { codingAgentManager } from '../../server/codingAgents/codingAgentManager';
import { agentTeamEngine } from '../../server/agentTeam';
import { deriveExecutionStatus } from '../../server/codingAgents/types';
import { GitHubManager } from '../../server/github/githubManager';
import { GitHubClient } from '../../server/github/githubClient';

export async function runHardeningVerificationTests() {
  console.log('\n====================================================');
  console.log('🛡️ HARDENING P0/P1 VERIFICATION: 21 TEST SUITE');
  console.log('====================================================\n');

  // Helper mock provider generator
  function createTestProvider(config: {
    id: AIProviderId;
    name: string;
    models: string[];
    onGenerate: (options: GenerateOptions) => Promise<GenerationUsageResult>;
  }): IAIProvider {
    return {
      id: config.id,
      name: config.name,
      defaultModel: config.models[0],
      sourceType: 'Test Provider',
      tokenCounterSupported: true,
      models: config.models.map((m) => ({
        name: m,
        displayName: m,
        contextWindow: 100000,
        supportsTools: true,
        costTier: 'flash',
        providerId: config.id,
      })),
      isConfigured(): boolean {
        return true;
      },
      generateContent: config.onGenerate,
      countTokens: async () => ({ tokenCount: 10, isRealProvider: true }),
    };
  }

  function createTestManager(): ProviderManager {
    return new ProviderManager({ registerDefaults: false });
  }

  // Ensure clean quota & cooldown state across tests
  quotaManager.resetState();

  // -------------------------------------------------------------
  // TEST 1: Premier modèle réussit
  // -------------------------------------------------------------
  {
    console.log('--- TEST 1: Premier modèle réussit ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'mock',
      name: 'Test Success',
      models: ['model-primary'],
      onGenerate: async (opts) => ({
        text: 'Primary succeeded directly',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        provider: 'mock',
        model: opts.model,
        isRealProviderUsage: true,
        tokenAccountingType: 'real_provider',
        generationOutcome: 'REAL_PROVIDER_SUCCESS',
      }),
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('model-primary', 'prompt', 'fallback', 'developer', 'mock');
    assert.strictEqual(res.text, 'Primary succeeded directly');
    assert.strictEqual(res.model, 'model-primary');
    assert.strictEqual(res.isRealProviderUsage, true);
    assert.strictEqual(res.generationOutcome, 'REAL_PROVIDER_SUCCESS');
    assert.ok(!res.failoverHistory || res.failoverHistory.length === 0, 'No failover history for first-try success');
    console.log('✅ PASS TEST 1: Premier modèle réussit');
  }

  // -------------------------------------------------------------
  // TEST 2: Premier modèle 429 → second modèle réussit
  // -------------------------------------------------------------
  {
    console.log('--- TEST 2: Premier modèle 429 → second modèle réussit ---');
    const pm = createTestManager();
    let callCount = 0;
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test 429 Failover',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      onGenerate: async (opts) => {
        callCount++;
        if (opts.model === 'gemini-2.5-flash') {
          throw { status: 429, message: 'Rate limit exceeded: Requests per minute limit reached', headers: { 'retry-after': '30' } };
        }
        return {
          text: 'Secondary 2.5-pro succeeded',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'gemini',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-2.5-flash', 'prompt', 'fallback', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Secondary 2.5-pro succeeded');
    assert.strictEqual(res.model, 'gemini-2.5-pro');
    assert.strictEqual(res.isRealProviderUsage, true);
    assert.strictEqual(res.generationOutcome, 'REAL_PROVIDER_SUCCESS');
    assert.strictEqual(res.failoverHistory?.length, 1);
    assert.strictEqual(res.failoverHistory?.[0].reason, 'RATE_LIMIT');
    console.log('✅ PASS TEST 2: Premier modèle 429 → second modèle réussit');
  }

  // -------------------------------------------------------------
  // TEST 3: 503/high demand → fallback
  // -------------------------------------------------------------
  {
    console.log('--- TEST 3: 503/high demand → fallback ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test 503 High Demand',
      models: ['gemini-demand-1'],
      onGenerate: async () => {
        throw new Error('503 UNAVAILABLE: This model is currently experiencing high demand.');
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-demand-1', 'prompt', 'Graceful fallback for 503', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Graceful fallback for 503');
    assert.strictEqual(res.isRealProviderUsage, false);
    assert.strictEqual(res.generationOutcome, 'DEGRADED_FALLBACK');
    assert.strictEqual(res.failoverHistory?.[0].reason, 'HIGH_DEMAND');
    console.log('✅ PASS TEST 3: 503/high demand → fallback');
  }

  // -------------------------------------------------------------
  // TEST 4: quota → fallback
  // -------------------------------------------------------------
  {
    console.log('--- TEST 4: quota → fallback ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test Quota',
      models: ['gemini-quota-1'],
      onGenerate: async () => {
        throw new Error('RESOURCE_EXHAUSTED: You have exceeded your daily quota limit');
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-quota-1', 'prompt', 'Graceful fallback for quota', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Graceful fallback for quota');
    assert.strictEqual(res.isRealProviderUsage, false);
    assert.strictEqual(res.generationOutcome, 'DEGRADED_FALLBACK');
    assert.strictEqual(res.failoverHistory?.[0].reason, 'QUOTA');
    console.log('✅ PASS TEST 4: quota → fallback');
  }

  // -------------------------------------------------------------
  // TEST 5: Agent execution terminated due to error → fallback
  // -------------------------------------------------------------
  {
    console.log('--- TEST 5: Agent execution terminated due to error → fallback ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test Terminated',
      models: ['gemini-term-a', 'gemini-term-b'],
      onGenerate: async (opts) => {
        if (opts.model === 'gemini-term-a') {
          throw new Error('Encountered retryable error from model provider:\nAgent execution terminated due to error.');
        }
        return {
          text: 'Fell over and succeeded on gemini-term-b',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'gemini',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-term-a', 'prompt', 'fallback', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Fell over and succeeded on gemini-term-b');
    assert.strictEqual(res.model, 'gemini-term-b');
    assert.strictEqual(res.failoverHistory?.[0].reason, 'MODEL_EXECUTION_ERROR');
    assert.strictEqual(res.failoverHistory?.[0].retryable, true);
    console.log('✅ PASS TEST 5: Agent execution terminated due to error → fallback');
  }

  // -------------------------------------------------------------
  // TEST 6: erreur temporaire → fallback
  // -------------------------------------------------------------
  {
    console.log('--- TEST 6: erreur temporaire → fallback ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test Temporary',
      models: ['gemini-temp-a', 'gemini-temp-b'],
      onGenerate: async (opts) => {
        if (opts.model === 'gemini-temp-a') {
          throw new Error('ECONNRESET connection reset by peer');
        }
        return {
          text: 'Temporary error recovered on model b',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'gemini',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-temp-a', 'prompt', 'fallback', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Temporary error recovered on model b');
    assert.strictEqual(res.failoverHistory?.[0].reason, 'TEMPORARY_UNAVAILABLE');
    assert.strictEqual(res.failoverHistory?.[0].retryable, true);
    console.log('✅ PASS TEST 6: erreur temporaire → fallback');
  }

  // -------------------------------------------------------------
  // TEST 7: erreur authentication → pas de retry inutile du même provider
  // -------------------------------------------------------------
  {
    console.log('--- TEST 7: erreur authentication → pas de retry inutile du même provider ---');
    const pm = createTestManager();
    const attempts: string[] = [];

    const pOpenAI = createTestProvider({
      id: 'openai',
      name: 'Broken Auth OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      onGenerate: async (opts) => {
        attempts.push(`openai:${opts.model}`);
        throw { status: 401, message: 'Invalid API key provided' };
      },
    });

    const pAnthropic = createTestProvider({
      id: 'anthropic',
      name: 'Working Anthropic',
      models: ['claude-3-5-sonnet'],
      onGenerate: async (opts) => {
        attempts.push(`anthropic:${opts.model}`);
        return {
          text: 'Anthropic succeeded after OpenAI auth failed',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'anthropic',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });

    pm.registerProvider(pOpenAI);
    pm.registerProvider(pAnthropic);

    const res = await pm.generateWithUsage('gpt-4o', 'prompt', 'fallback', 'developer', 'openai');
    assert.strictEqual(res.provider, 'anthropic');
    assert.strictEqual(res.text, 'Anthropic succeeded after OpenAI auth failed');

    // Crucial check: OpenAI had 3 models registered, but only ONE was attempted because 401 blocks the provider!
    const openAiAttempts = attempts.filter((a) => a.startsWith('openai:'));
    assert.strictEqual(openAiAttempts.length, 1, 'Provider with authentication failure must not be retried with subsequent models');
    console.log('✅ PASS TEST 7: erreur authentication → pas de retry inutile du même provider');
  }

  // -------------------------------------------------------------
  // TEST 8: modèle introuvable → pas de boucle
  // -------------------------------------------------------------
  {
    console.log('--- TEST 8: modèle introuvable → pas de boucle ---');
    const pm = createTestManager();
    let tries = 0;
    const p = createTestProvider({
      id: 'gemini',
      name: 'Test 404 Model Not Found',
      models: ['gemini-invalid'],
      onGenerate: async () => {
        tries++;
        throw { status: 404, message: 'Model not found or unsupported' };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-invalid', 'prompt', 'Model not found fallback', 'developer', 'gemini');
    assert.strictEqual(tries, 1, 'Model not found must not loop indefinitely');
    assert.strictEqual(res.text, 'Model not found fallback');
    assert.strictEqual(res.generationOutcome, 'DEGRADED_FALLBACK');
    console.log('✅ PASS TEST 8: modèle introuvable → pas de boucle');
  }

  // -------------------------------------------------------------
  // TEST 9: aucun doublon provider/model
  // -------------------------------------------------------------
  {
    console.log('--- TEST 9: aucun doublon provider/model ---');
    const pm = createTestManager();
    const attemptedKeys: string[] = [];

    const p = createTestProvider({
      id: 'gemini',
      name: 'Dedup Test',
      models: ['gemini-dedup-1', 'gemini-dedup-2'],
      onGenerate: async (opts) => {
        const key = `gemini:${opts.model}`;
        attemptedKeys.push(key);
        throw new Error('Temporary failure');
      },
    });
    pm.registerProvider(p);

    await pm.generateWithUsage('gemini-dedup-1', 'prompt', 'fallback', 'developer', 'gemini');

    const keySet = new Set(attemptedKeys);
    assert.strictEqual(attemptedKeys.length, keySet.size, 'Every (provider, model) attempt must be unique, with zero duplicates');
    console.log('✅ PASS TEST 9: aucun doublon provider/model');
  }

  // -------------------------------------------------------------
  // TEST 10: cooldown respecté
  // -------------------------------------------------------------
  {
    console.log('--- TEST 10: cooldown respecté ---');
    const pm = createTestManager();
    const coolModel = 'gemini-cooldown-target';
    const backupModel = 'gemini-cooldown-backup';

    // Put primary model into cooldown
    quotaManager.handleCooldown(coolModel, 60, 'RATE_LIMIT');
    assert.strictEqual(quotaManager.isModelInCooldown(coolModel), true);

    const attempts: string[] = [];
    const p = createTestProvider({
      id: 'gemini',
      name: 'Cooldown Provider',
      models: [coolModel, backupModel],
      onGenerate: async (opts) => {
        attempts.push(opts.model);
        return {
          text: `Success on ${opts.model}`,
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'gemini',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage(coolModel, 'prompt', 'fallback', 'developer', 'gemini');
    assert.strictEqual(res.model, backupModel, 'Model in cooldown was skipped cleanly in favor of backupModel');
    assert.ok(!attempts.includes(coolModel), 'Model currently in cooldown was not called');
    console.log('✅ PASS TEST 10: cooldown respecté');
  }

  // -------------------------------------------------------------
  // TEST 11: tous les providers échouent
  // -------------------------------------------------------------
  {
    console.log('--- TEST 11: tous les providers échouent ---');
    const pm = createTestManager();
    const p1 = createTestProvider({
      id: 'gemini',
      name: 'Failing Gemini',
      models: ['gemini-fail'],
      onGenerate: async () => { throw new Error('Gemini failed'); },
    });
    const p2 = createTestProvider({
      id: 'openai',
      name: 'Failing OpenAI',
      models: ['openai-fail'],
      onGenerate: async () => { throw new Error('OpenAI failed'); },
    });
    pm.registerProvider(p1);
    pm.registerProvider(p2);

    const res = await pm.generateWithUsage('gemini-fail', 'prompt', 'Exhaustive fallback text', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Exhaustive fallback text');
    assert.strictEqual(res.isRealProviderUsage, false);
    assert.strictEqual(res.generationOutcome, 'DEGRADED_FALLBACK');
    assert.ok(res.failoverHistory && res.failoverHistory.length >= 2, 'History captured both failures');
    console.log('✅ PASS TEST 11: tous les providers échouent');
  }

  // -------------------------------------------------------------
  // TEST 12: fallbackText retourné sans être confondu avec REAL_PROVIDER_SUCCESS
  // -------------------------------------------------------------
  {
    console.log('--- TEST 12: fallbackText retourné sans être confondu avec REAL_PROVIDER_SUCCESS ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Failing for Fallback',
      models: ['gemini-fb'],
      onGenerate: async () => { throw new Error('API down'); },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('gemini-fb', 'prompt', 'Explicit fallback content', 'developer', 'gemini');
    assert.strictEqual(res.text, 'Explicit fallback content');
    assert.strictEqual(res.isRealProviderUsage, false, 'Fallback must NOT have isRealProviderUsage = true');
    assert.strictEqual(res.generationOutcome, 'DEGRADED_FALLBACK', 'Fallback outcome must be DEGRADED_FALLBACK');
    assert.notStrictEqual(res.generationOutcome, 'REAL_PROVIDER_SUCCESS');
    assert.strictEqual(res.tokenAccountingType, 'fallback_unknown');
    console.log('✅ PASS TEST 12: fallbackText retourné sans être confondu avec REAL_PROVIDER_SUCCESS');
  }

  // -------------------------------------------------------------
  // TEST 13: failoverHistory correctement rempli
  // -------------------------------------------------------------
  {
    console.log('--- TEST 13: failoverHistory correctement rempli ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Multi-fail Gemini',
      models: ['m1', 'm2', 'm3'],
      onGenerate: async (opts) => {
        if (opts.model === 'm1') throw { status: 429, message: 'm1 rate limit' };
        if (opts.model === 'm2') throw new Error('m2 temporarily unavailable (ECONNRESET)');
        return {
          text: 'm3 finally succeeded',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          provider: 'gemini',
          model: opts.model,
          isRealProviderUsage: true,
          tokenAccountingType: 'real_provider',
          generationOutcome: 'REAL_PROVIDER_SUCCESS',
        };
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('m1', 'prompt', 'fallback', 'developer', 'gemini');
    assert.strictEqual(res.model, 'm3');
    assert.strictEqual(res.failoverHistory?.length, 2);
    assert.strictEqual(res.failoverHistory?.[0].model, 'm1');
    assert.strictEqual(res.failoverHistory?.[0].reason, 'RATE_LIMIT');
    assert.strictEqual(res.failoverHistory?.[1].model, 'm2');
    assert.strictEqual(res.failoverHistory?.[1].reason, 'TEMPORARY_UNAVAILABLE');
    assert.ok(typeof res.failoverHistory?.[0].timestamp === 'number');
    console.log('✅ PASS TEST 13: failoverHistory correctement rempli');
  }

  // -------------------------------------------------------------
  // TEST 14: aucun secret dans failoverHistory
  // -------------------------------------------------------------
  {
    console.log('--- TEST 14: aucun secret dans failoverHistory ---');
    const pm = createTestManager();
    const p = createTestProvider({
      id: 'gemini',
      name: 'Leaky Error Provider',
      models: ['m-leak'],
      onGenerate: async () => {
        throw new Error('Call failed with key=AIzaSyA123456789012345678901234567890 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sk-ant-api03-abcdefg and gsk_12345678');
      },
    });
    pm.registerProvider(p);

    const res = await pm.generateWithUsage('m-leak', 'prompt', 'fallback', 'developer', 'gemini');
    const history = res.failoverHistory || [];
    assert.ok(history.length > 0);
    for (const record of history) {
      assert.ok(!record.error.includes('AIzaSyA1234567890'), 'Gemini API key stripped');
      assert.ok(!record.error.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'JWT Bearer token stripped');
      assert.ok(!record.error.includes('sk-ant-api03-abcdefg'), 'Anthropic API key stripped');
      assert.ok(!record.error.includes('gsk_12345678'), 'Groq API key stripped');
    }
    console.log('✅ PASS TEST 14: aucun secret dans failoverHistory');
  }

  // -------------------------------------------------------------
  // TEST 15: QUEUED reste RUNNING
  // -------------------------------------------------------------
  {
    console.log('--- TEST 15: QUEUED reste RUNNING ---');
    assert.strictEqual(deriveExecutionStatus('QUEUED'), 'RUNNING');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_QUEUED: Async pipeline build',
    });

    assert.strictEqual(result.executionStatus, 'RUNNING');
    assert.strictEqual(result.status, 'QUEUED');
    assert.strictEqual(result.success, false, 'Running session success must be false (not completed yet)');
    assert.strictEqual(result.error, undefined, 'Running session must not have error');

    // Also verify in agentTeamEngine
    const teamResult = await agentTeamEngine.runWithCodingAgent({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_QUEUED: AgentTeam queued run',
    });
    assert.strictEqual(teamResult.executionStatus, 'RUNNING');
    assert.strictEqual(teamResult.success, false);
    console.log('✅ PASS TEST 15: QUEUED reste RUNNING');
  }

  // -------------------------------------------------------------
  // TEST 16: PLANNING reste RUNNING
  // -------------------------------------------------------------
  {
    console.log('--- TEST 16: PLANNING reste RUNNING ---');
    assert.strictEqual(deriveExecutionStatus('PLANNING'), 'RUNNING');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_PLANNING: Architecture formulation',
    });

    assert.strictEqual(result.executionStatus, 'RUNNING');
    assert.strictEqual(result.status, 'PLANNING');
    assert.strictEqual(result.success, false);
    console.log('✅ PASS TEST 16: PLANNING reste RUNNING');
  }

  // -------------------------------------------------------------
  // TEST 17: IN_PROGRESS reste RUNNING
  // -------------------------------------------------------------
  {
    console.log('--- TEST 17: IN_PROGRESS reste RUNNING ---');
    assert.strictEqual(deriveExecutionStatus('IN_PROGRESS'), 'RUNNING');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_IN_PROGRESS: Writing tests',
    });

    assert.strictEqual(result.executionStatus, 'RUNNING');
    assert.strictEqual(result.status, 'IN_PROGRESS');
    assert.strictEqual(result.success, false);
    console.log('✅ PASS TEST 17: IN_PROGRESS reste RUNNING');
  }

  // -------------------------------------------------------------
  // TEST 18: COMPLETED devient COMPLETED
  // -------------------------------------------------------------
  {
    console.log('--- TEST 18: COMPLETED devient COMPLETED ---');
    assert.strictEqual(deriveExecutionStatus('COMPLETED'), 'COMPLETED');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_COMPLETED: Finished task execution',
    });

    assert.strictEqual(result.executionStatus, 'COMPLETED');
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.error, undefined);
    console.log('✅ PASS TEST 18: COMPLETED devient COMPLETED');
  }

  // -------------------------------------------------------------
  // TEST 19: FAILED devient FAILED
  // -------------------------------------------------------------
  {
    console.log('--- TEST 19: FAILED devient FAILED ---');
    assert.strictEqual(deriveExecutionStatus('FAILED'), 'FAILED');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_TRIGGER_FAILURE: Compilation syntax error in patch',
    });

    assert.strictEqual(result.executionStatus, 'FAILED');
    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Compilation syntax error'));
    console.log('✅ PASS TEST 19: FAILED devient FAILED');
  }

  // -------------------------------------------------------------
  // TEST 20: CANCELLED devient CANCELLED
  // -------------------------------------------------------------
  {
    console.log('--- TEST 20: CANCELLED devient CANCELLED ---');
    assert.strictEqual(deriveExecutionStatus('CANCELLED'), 'CANCELLED');

    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_CANCELLED: User stopped task',
    });

    assert.strictEqual(result.executionStatus, 'CANCELLED');
    assert.strictEqual(result.status, 'CANCELLED');
    assert.strictEqual(result.success, false);
    console.log('✅ PASS TEST 20: CANCELLED devient CANCELLED');
  }

  // -------------------------------------------------------------
  // TEST 21: QUEUED + GitHub automation ne devient jamais FAILED par erreur
  // -------------------------------------------------------------
  {
    console.log('--- TEST 21: QUEUED + GitHub automation ne devient jamais FAILED par erreur ---');
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    // Reset githubManager to unconfigured state
    (codingAgentManager as any).githubManager = new GitHubManager(new GitHubClient({ token: '' }));
    assert.strictEqual((codingAgentManager as any).githubManager.isConfigured(), false);

    // Launch task with QUEUED simulation + commitAndPush requested
    const result = await codingAgentManager.execute({
      agent: 'mock',
      repository: 'MohamedGH/agentTeam',
      branch: 'main',
      task: 'TASK_SIMULATE_QUEUED: Async pipeline build with commitAndPush',
      commitAndPush: true,
      commitPushAndCreatePR: true,
    });

    // CRITICAL: It MUST remain RUNNING, and NOT fail with "GITHUB_TOKEN is not configured"
    assert.strictEqual(
      result.executionStatus,
      'RUNNING',
      'QUEUED task with git options must remain RUNNING, never FAILED prematurely'
    );
    assert.notStrictEqual(result.error, 'GITHUB_TOKEN is not configured');
    assert.strictEqual(result.testsPassed, undefined, 'Tests passed must be undefined while still running');
    assert.strictEqual(result.success, false);

    // Restore environment
    if (originalToken) {
      process.env.GITHUB_TOKEN = originalToken;
    }
    console.log('✅ PASS TEST 21: QUEUED + GitHub automation ne devient jamais FAILED par erreur');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 21 HARDENING P0/P1 TESTS PASSED PERFECTLY!');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('hardeningVerification')) {
  runHardeningVerificationTests().catch((err) => {
    console.error('Hardening verification tests failed:', err);
    process.exit(1);
  });
}
