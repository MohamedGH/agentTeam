import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { AgentTeamEngine } from '../../server/agentTeam';
import { LLMPerformanceMemory } from '../../server/llm/LLMPerformanceMemory';
import { LLMRegistry } from '../../server/llm/LLMRegistry';
import { LLMRankingEngine } from '../../server/llm/LLMRankingEngine';
import { LLMSelector } from '../../server/llm/LLMSelector';
import { LLMPerformanceEvaluator } from '../../server/llm/LLMPerformanceEvaluator';
import { ProblemClassifier } from '../../server/llm/ProblemClassifier';
import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { QuotaManager } from '../../server/quotaManager';
import { VirtualWorkspace } from '../../server/virtualWorkspace';

/**
 * End-to-End Test for the Adaptive LLM Learning & Feedback Loop
 *
 * Demonstrates a complete, real empirical loop:
 * Task 1
 *   ↓
 * AgentTeamEngine.runWorkflow(Task 1)
 *   ↓
 * REAL_TASK generated automatically (runId = result1.taskId)
 *   ↓
 * LLMPerformanceMemory
 *   ↓
 * LLMRankingEngine
 *   ↓
 * Task 2 (equivalent problem category)
 *   ↓
 * AgentTeamEngine.runWorkflow(Task 2)
 *   ↓
 * New selection dynamically driven by Task 1 empirical performance data
 */
export async function runAdaptiveFeedbackLoopE2ETests(): Promise<void> {
  console.log('\n====================================================');
  console.log('🔄 RUNNING REAL ADAPTIVE FEEDBACK LOOP E2E TESTS');
  console.log('====================================================\n');

  const testStoragePath = path.resolve(process.cwd(), 'data', 'test_adaptive_feedback_loop_isolated.json');
  if (fs.existsSync(testStoragePath)) {
    fs.unlinkSync(testStoragePath);
  }

  // 1. Setup isolated provider manager and controlled mock provider
  const mockProvider = new MockProvider();
  const isolatedProviderManager = new ProviderManager({ registerDefaults: false });
  isolatedProviderManager.registerProvider(mockProvider);
  isolatedProviderManager.setActiveProvider('mock');

  const isolatedQuotaManager = new QuotaManager();
  const memory = new LLMPerformanceMemory(testStoragePath);
  const registry = new LLMRegistry(isolatedProviderManager, memory);
  const rankingEngine = new LLMRankingEngine(memory, registry, { includeHermetic: true });
  const classifier = new ProblemClassifier();
  const evaluator = new LLMPerformanceEvaluator();
  const workspace = new VirtualWorkspace();

  const selector = new LLMSelector(classifier, registry, rankingEngine, memory, {
    explorationRate: 0, // Strict exploitation for deterministic test assertions
    minSamplesForConfidentRank: 1,
    includeHermetic: true,
  });

  const engine = new AgentTeamEngine({
    providerManager: isolatedProviderManager,
    quotaManager: isolatedQuotaManager,
    llmSelector: selector,
    llmPerformanceEvaluator: evaluator,
    llmPerformanceMemory: memory,
    problemClassifier: classifier,
    rankingEngine,
    workspace,
  });

  // --------------------------------------------------------------------------
  // STEP 1: INITIAL DETERMINISTIC BASELINE (Clean fixtures)
  // --------------------------------------------------------------------------
  console.log('--- Step 1: Establish Initial Deterministic Baseline ---');
  // Seed baseline fixture for model A (mock-fast-model) with score 0.95
  memory.addEvaluation({
    id: 'eval_initial_seed_fast',
    modelId: 'mock-fast-model',
    providerId: 'mock',
    problemId: 'fixture_initial_seed_1',
    category: 'CODE_GENERATION',
    evaluationSource: 'HERMETIC_FIXTURE',
    success: true,
    score: 0.95,
    latencyMs: 100,
    testsPassed: 5,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now() - 50000,
    proof: {
      requestedModelId: 'mock-fast-model',
      requestedProviderId: 'mock',
      actualModelId: 'mock-fast-model',
      actualProviderId: 'mock',
      failoverUsed: false,
      isIdentityVerified: true,
      isCompliantWithSelection: true,
      identitySource: 'MOCK_DETERMINISTIC_PROOF',
    },
  });

  // Seed baseline fixture for model B (mock-pro-model) with score 0.85
  memory.addEvaluation({
    id: 'eval_initial_seed_pro',
    modelId: 'mock-pro-model',
    providerId: 'mock',
    problemId: 'fixture_initial_seed_2',
    category: 'CODE_GENERATION',
    evaluationSource: 'HERMETIC_FIXTURE',
    success: true,
    score: 0.85,
    latencyMs: 300,
    testsPassed: 4,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now() - 50000,
    proof: {
      requestedModelId: 'mock-pro-model',
      requestedProviderId: 'mock',
      actualModelId: 'mock-pro-model',
      actualProviderId: 'mock',
      failoverUsed: false,
      isIdentityVerified: true,
      isCompliantWithSelection: true,
      identitySource: 'MOCK_DETERMINISTIC_PROOF',
    },
  });

  // Strict invariant check: exactly 0 REAL_TASK evaluations prior to Task 1
  assert.strictEqual(
    memory.getEvaluations({ sources: ['REAL_TASK'] }).length,
    0,
    'Initial count of REAL_TASK evaluations in memory before Task 1 execution must strictly be 0'
  );

  const initialRankings = rankingEngine.getRankings('CODE_GENERATION');
  assert(initialRankings.rankedModels.length >= 2, 'Initial rankings include both mock models');
  assert(
    initialRankings.rankedModels[0].modelId === 'mock-fast-model',
    'mock-fast-model is initially ranked #1 due to higher baseline score (0.95 vs 0.85)'
  );

  // --------------------------------------------------------------------------
  // STEP 2: EXECUTE WORKFLOW FOR TASK 1 (Model A fails QA/Review)
  // --------------------------------------------------------------------------
  console.log('\n--- Step 2: Real Workflow Execution of Task 1 (Automatic Ingestion) ---');
  
  // Configure MockProvider so that mock-fast-model produces a reviewer failure / regression on Task 1
  mockProvider.mockTextOverride = 'STATUS: FAIL - CHANGES_REQUIRED. High security regression detected during code audit.';

  const taskPrompt1 = 'Implement a thread-safe LRU Cache with TTL in TypeScript';
  const result1 = await engine.runWorkflow(taskPrompt1, 'tier_3', undefined, { provider: 'mock' });

  console.log(`Task 1 executed by: ${result1.modelUsed} | Status: ${result1.executionStatus} | Success: ${result1.success}`);
  assert(result1.modelUsed === 'mock-fast-model', 'Task 1 dynamically selected initial Rank #1 model (mock-fast-model)');
  assert(result1.selectionDecision !== undefined, 'Task 1 has selectionDecision attached');
  assert(result1.selectionDecision.selectedModelId === 'mock-fast-model', 'Task 1 selectionDecision confirms mock-fast-model');
  assert(result1.realTaskEvaluationId !== undefined, 'Task 1 produced an automatic REAL_TASK evaluation ID');

  // Verify Execution Proof on result1
  assert(result1.execution !== undefined, 'Execution proof exists on TeamRunResult 1');
  assert(result1.execution.requestedModelId === 'mock-fast-model', 'Requested model is mock-fast-model');
  assert(result1.execution.actualModelId === 'mock-fast-model', 'Actual model is mock-fast-model');
  assert(result1.execution.failoverUsed === false, 'No failover occurred on Task 1');
  assert(result1.execution.isIdentityVerified === true, 'Identity is verified for Task 1');
  assert(result1.execution.identitySource === 'MOCK_DETERMINISTIC_PROOF', 'Identity source is deterministic proof');

  // --------------------------------------------------------------------------
  // STEP 3: VERIFY REAL_TASK IN MEMORY FROM TASK 1
  // --------------------------------------------------------------------------
  console.log('\n--- Step 3: Verify Memory State After Task 1 Automatic Ingestion ---');
  const task1RecordedEval = memory.getEvaluations({ sources: ['REAL_TASK'] }).find((e) => e.id === result1.realTaskEvaluationId);
  assert(task1RecordedEval !== undefined, 'Task 1 evaluation was automatically persisted into LLMPerformanceMemory');
  assert(task1RecordedEval?.runId === result1.taskId, `Evaluation runId (${task1RecordedEval?.runId}) matches taskId (${result1.taskId})`);
  assert(task1RecordedEval?.modelId === 'mock-fast-model', 'Evaluation is attributed to mock-fast-model');
  assert(task1RecordedEval?.evaluationSource === 'REAL_TASK', 'Evaluation source is strictly REAL_TASK');
  assert(task1RecordedEval?.regressionDetected === true, 'Regression was recorded in Task 1 evaluation');
  assert(task1RecordedEval?.proof?.isIdentityVerified === true, 'Proof identity is verified');
  assert(task1RecordedEval?.proof?.failoverUsed === false, 'Proof indicates no failover');

  // Verify ranking has dynamically updated after Task 1
  const intermediateRankings = rankingEngine.getRankings('CODE_GENERATION');
  console.log('Updated rankings after Task 1 feedback:');
  for (const r of intermediateRankings.rankedModels) {
    console.log(` - Model: ${r.modelId} | Score: ${r.meanScore} | CompositeRank: ${r.compositeRankScore} | Samples: ${r.sampleCount}`);
  }
  assert(
    intermediateRankings.rankedModels[0].modelId === 'mock-pro-model',
    'mock-pro-model has overtaken mock-fast-model as Rank #1 due to Task 1 failure'
  );

  // --------------------------------------------------------------------------
  // STEP 4: EXECUTE WORKFLOW FOR TASK 2 (With Same Injected Components)
  // --------------------------------------------------------------------------
  console.log('\n--- Step 4: Real Workflow Execution of Task 2 (Adaptive Shift) ---');
  // Configure MockProvider so that mock-pro-model succeeds on Task 2
  mockProvider.mockTextOverride = 'STATUS: APPROVED. Code architecture is solid, all security criteria pass.';

  const taskPrompt2 = 'Implement an asynchronous sliding window rate limiter in TypeScript';
  const result2 = await engine.runWorkflow(taskPrompt2, 'tier_3', undefined, { provider: 'mock' });

  console.log(`Task 2 executed by: ${result2.modelUsed} | Status: ${result2.executionStatus} | Success: ${result2.success}`);
  assert(
    result2.modelUsed === 'mock-pro-model',
    'Task 2 adaptively routes to mock-pro-model based on empirical data generated by Task 1'
  );
  assert(result2.modelUsed !== result1.modelUsed, 'Task 2 selected a different model than Task 1');
  assert(result2.selectionDecision.selectedModelId === 'mock-pro-model', 'Task 2 selectionDecision is mock-pro-model');
  assert(result2.success === true, 'Task 2 completed successfully');
  assert(result2.realTaskEvaluationId !== undefined, 'Task 2 produced an automatic REAL_TASK evaluation ID');

  // Verify Execution Proof on result2
  assert(result2.execution.requestedModelId === 'mock-pro-model', 'Requested model is mock-pro-model');
  assert(result2.execution.actualModelId === 'mock-pro-model', 'Actual model is mock-pro-model');
  assert(result2.execution.isIdentityVerified === true, 'Identity is verified for Task 2');
  assert(result2.execution.isCompliantWithSelection === true, 'Task 2 is compliant with selection');

  const task2RecordedEval = memory.getEvaluations({ sources: ['REAL_TASK'] }).find((e) => e.id === result2.realTaskEvaluationId);
  assert(task2RecordedEval !== undefined, 'Task 2 evaluation was automatically stored in memory');
  assert(task2RecordedEval?.runId === result2.taskId, 'Task 2 evaluation runId matches result2.taskId');
  assert(task2RecordedEval?.modelId === 'mock-pro-model', 'Task 2 evaluation attributed to mock-pro-model');
  assert(task2RecordedEval?.success === true, 'Task 2 evaluation marked as success');

  // --------------------------------------------------------------------------
  // STEP 5: TEST DEDUPLICATION BEHAVIOR
  // --------------------------------------------------------------------------
  console.log('\n--- Step 5: Verify Deduplication Contracts ---');
  const sharedRunId = 'bench_shared_run_999';

  // 1. Same runId + different models => 2 distinct evaluations
  memory.addEvaluation({
    id: 'eval_run_model_a',
    runId: sharedRunId,
    modelId: 'mock-model-alpha',
    providerId: 'mock',
    problemId: 'problem_dedup_test',
    category: 'CODE_GENERATION',
    evaluationSource: 'LIVE_PROVIDER',
    success: true,
    score: 0.8,
    latencyMs: 150,
    timestamp: 1000000,
  });

  memory.addEvaluation({
    id: 'eval_run_model_b',
    runId: sharedRunId,
    modelId: 'mock-model-beta',
    providerId: 'mock',
    problemId: 'problem_dedup_test',
    category: 'CODE_GENERATION',
    evaluationSource: 'LIVE_PROVIDER',
    success: true,
    score: 0.9,
    latencyMs: 160,
    timestamp: 1000000,
  });

  const evalsInSharedRun = memory.getEvaluations().filter((e) => e.runId === sharedRunId);
  assert.strictEqual(evalsInSharedRun.length, 2, 'Different models in same runId produce 2 distinct evaluations');

  // 2. Exactly same evaluation ID => single evaluation updated
  memory.addEvaluation({
    id: 'eval_run_model_a',
    runId: sharedRunId,
    modelId: 'mock-model-alpha',
    providerId: 'mock',
    problemId: 'problem_dedup_test',
    category: 'CODE_GENERATION',
    evaluationSource: 'LIVE_PROVIDER',
    success: true,
    score: 0.99, // Updated score
    latencyMs: 140,
    timestamp: 1000000,
  });

  const evalsAfterUpdate = memory.getEvaluations().filter((e) => e.runId === sharedRunId);
  assert.strictEqual(evalsAfterUpdate.length, 2, 'Exact same evaluation identity updates existing record without inflating count');
  const updatedRecord = evalsAfterUpdate.find((e) => e.id === 'eval_run_model_a');
  assert.strictEqual(updatedRecord?.score, 0.99, 'Updated evaluation record reflected in memory');

  // 3. Same problem replayed at another time with a new run => NOT collapsed into 1 evaluation
  memory.addEvaluation({
    id: 'eval_run_2_model_a',
    runId: 'bench_new_run_1000',
    modelId: 'mock-model-alpha',
    providerId: 'mock',
    problemId: 'problem_dedup_test', // Same problemId, but new independent run!
    category: 'CODE_GENERATION',
    evaluationSource: 'LIVE_PROVIDER',
    success: true,
    score: 0.85,
    latencyMs: 145,
    timestamp: 2000000,
  });

  const allAlphaForProblem = memory.getEvaluations().filter(
    (e) => e.modelId === 'mock-model-alpha' && e.problemId === 'problem_dedup_test'
  );
  assert.strictEqual(
    allAlphaForProblem.length,
    2,
    'Replaying same problem in a new run maintains distinct independent observations'
  );

  // --------------------------------------------------------------------------
  // STEP 6: TEST COST ACCOUNTING (UNKNOWN_COST and Mixed Costs)
  // --------------------------------------------------------------------------
  console.log('\n--- Step 6: Verify Cost Accounting Contracts ---');
  // Case A: All unknown costs -> meanCost = -1, costKnown = false
  memory.addEvaluation({
    id: 'eval_cost_unknown_1',
    modelId: 'mock-unknown-cost-model',
    providerId: 'mock',
    problemId: 'prob_cost_1',
    category: 'REFACTORING',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.9,
    latencyMs: 200,
    estimatedCost: undefined,
    costSource: 'UNKNOWN_COST',
    timestamp: Date.now(),
  });

  const allUnknownStats = memory.getStats('mock-unknown-cost-model', 'REFACTORING');
  assert(allUnknownStats !== null, 'Stats computed for unknown cost model');
  assert.strictEqual(allUnknownStats?.costKnown, false, 'costKnown is false when all costs are unknown');
  assert.strictEqual(allUnknownStats?.meanCost, -1, 'meanCost is -1 (not 0) when all costs are unknown');

  // Case B: Mixed known and unknown costs -> meanCost calculated only on known costs
  memory.addEvaluation({
    id: 'eval_cost_known_1',
    modelId: 'mock-mixed-cost-model',
    providerId: 'mock',
    problemId: 'prob_cost_2',
    category: 'DEBUGGING',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.9,
    latencyMs: 200,
    estimatedCost: 0.05,
    costSource: 'REAL_COST',
    timestamp: Date.now(),
  });

  memory.addEvaluation({
    id: 'eval_cost_known_2',
    modelId: 'mock-mixed-cost-model',
    providerId: 'mock',
    problemId: 'prob_cost_3',
    category: 'DEBUGGING',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.9,
    latencyMs: 200,
    estimatedCost: 0.15,
    costSource: 'REAL_COST',
    timestamp: Date.now(),
  });

  memory.addEvaluation({
    id: 'eval_cost_unknown_2',
    modelId: 'mock-mixed-cost-model',
    providerId: 'mock',
    problemId: 'prob_cost_4',
    category: 'DEBUGGING',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.9,
    latencyMs: 200,
    estimatedCost: undefined,
    costSource: 'UNKNOWN_COST',
    timestamp: Date.now(),
  });

  const mixedStats = memory.getStats('mock-mixed-cost-model', 'DEBUGGING');
  assert(mixedStats !== null, 'Stats computed for mixed cost model');
  assert.strictEqual(mixedStats?.costKnown, true, 'costKnown is true when at least one cost is known');
  // (0.05 + 0.15) / 2 = 0.10
  assert.strictEqual(mixedStats?.meanCost, 0.1, `meanCost calculated strictly from known costs (expected 0.1, got ${mixedStats?.meanCost})`);

  // --------------------------------------------------------------------------
  // STEP 7: TEST PERSISTENCE OF uncertaintyDecayFactor
  // --------------------------------------------------------------------------
  console.log('\n--- Step 7: Verify Persistence of uncertaintyDecayFactor ---');
  selector.updateConfig({ uncertaintyDecayFactor: 0.52 });
  assert.strictEqual(memory.getUncertaintyDecayFactor(), 0.52, 'Memory factor updated via selector');

  // Reload memory from disk in fresh instance
  const reloadedMemory = new LLMPerformanceMemory(testStoragePath);
  assert.strictEqual(
    reloadedMemory.getUncertaintyDecayFactor(),
    0.52,
    `Reloaded instance preserves uncertaintyDecayFactor (0.52)`
  );

  // Clean up test file
  if (fs.existsSync(testStoragePath)) {
    fs.unlinkSync(testStoragePath);
  }

  console.log('\n====================================================');
  console.log('🎉 REAL ADAPTIVE FEEDBACK LOOP E2E TEST PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('adaptiveFeedbackLoopE2E')) {
  runAdaptiveFeedbackLoopE2ETests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Feedback loop E2E test failed:', err);
      process.exit(1);
    });
}
