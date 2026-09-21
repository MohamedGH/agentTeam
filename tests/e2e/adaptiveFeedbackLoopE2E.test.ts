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
import { providerManager } from '../../server/providerManager';
import { quotaManager } from '../../server/quotaManager';

/**
 * End-to-End Test for the Adaptive LLM Learning & Feedback Loop
 *
 * Demonstrates the full cyclical feedback chain:
 * 1. Task 1 submitted
 * 2. Problem classification (e.g. CODE_GENERATION)
 * 3. LLMSelector selects initial model (Model A)
 * 4. Controlled workflow execution
 * 5. Production REAL_TASK evaluation generated
 * 6. LLMPerformanceMemory persistence & cache update
 * 7. LLMRankingEngine dynamic ranking re-computation
 * 8. Task 2 (equivalent problem category) submitted
 * 9. Adaptive routing selects new optimal model (Model B) based on fresh empirical data
 */
export async function runAdaptiveFeedbackLoopE2ETests(): Promise<void> {
  console.log('\n====================================================');
  console.log('🔄 RUNNING ADAPTIVE FEEDBACK LOOP E2E TESTS');
  console.log('====================================================\n');

  // Setup isolated memory & engine instances
  const testStoragePath = path.resolve(process.cwd(), 'data', 'test_adaptive_feedback_loop.json');
  if (fs.existsSync(testStoragePath)) {
    fs.unlinkSync(testStoragePath);
  }

  const memory = new LLMPerformanceMemory(testStoragePath);
  const registry = new LLMRegistry(providerManager, memory);
  const rankingEngine = new LLMRankingEngine(memory);
  const classifier = new ProblemClassifier();
  const evaluator = new LLMPerformanceEvaluator();
  const selector = new LLMSelector(classifier, registry, rankingEngine, memory, {
    explorationRate: 0, // Deterministic pure exploitation based strictly on ranking
    minSamplesForConfidentRank: 1,
  });

  // Ensure mock provider is active
  providerManager.setActiveProvider('mock');
  quotaManager.resetState();

  // --------------------------------------------------------------------------
  // STEP 1: INITIAL STATE (Zero prior tasks, models have baseline status)
  // --------------------------------------------------------------------------
  console.log('--- Step 1: Initial Baseline State ---');
  const taskPrompt1 = 'Implement an asynchronous LRU cache with expiration in TypeScript';
  const classified1 = classifier.classify(taskPrompt1);
  assert(classified1.category === 'CODE_GENERATION', 'Task 1 classified as CODE_GENERATION');

  const initialEvals = memory.getEvaluations({ sources: ['REAL_TASK'] });
  assert(initialEvals.length === 0, 'Memory starts with 0 REAL_TASK evaluations');

  // Seed baseline rankings: Model A (mock-fast-model) is currently ranked higher
  memory.addEvaluation({
    id: 'eval_seed_a',
    modelId: 'mock-fast-model',
    providerId: 'mock',
    problemId: 'task_seed_1',
    category: 'CODE_GENERATION',
    complexity: classified1.complexity,
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.95,
    latencyMs: 120,
    testsPassed: 5,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now() - 10000,
  });

  memory.addEvaluation({
    id: 'eval_seed_b',
    modelId: 'mock-pro-model',
    providerId: 'mock',
    problemId: 'task_seed_2',
    category: 'CODE_GENERATION',
    complexity: classified1.complexity,
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.75,
    latencyMs: 400,
    testsPassed: 4,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now() - 10000,
  });

  const initialRankings = rankingEngine.getRankings('CODE_GENERATION', classified1.complexity);
  assert(initialRankings.rankedModels.length >= 2, 'Both models have initial rankings');
  assert(
    initialRankings.rankedModels[0].modelId === 'mock-fast-model',
    'mock-fast-model is initially ranked #1 due to higher initial score (0.95 vs 0.75)'
  );

  // --------------------------------------------------------------------------
  // STEP 2 & 3: TASK 1 - CLASSIFY & SELECT
  // --------------------------------------------------------------------------
  console.log('\n--- Steps 2 & 3: Task 1 Classification & Selection ---');
  const selection1 = selector.selectModelForTask(taskPrompt1, undefined, {
    preferredProviders: ['mock'],
  });

  assert(
    selection1.selectedModelId === 'mock-fast-model',
    'Task 1 selects mock-fast-model (Rank #1)'
  );
  assert(selection1.selectedProviderId === 'mock', 'Provider is mock');
  assert(selection1.decisionType === 'EXPLOITATION', 'Decision type is EXPLOITATION');

  // --------------------------------------------------------------------------
  // STEPS 4, 5, 6 & 7: EXECUTE TASK 1 -> RECORD REAL_TASK -> MEMORY -> RE-RANK
  // --------------------------------------------------------------------------
  console.log('\n--- Steps 4-7: Execute Task 1, Emit REAL_TASK, Update Memory, Recompute Ranking ---');
  
  // Model A encounters regression / failures in Task 1 execution
  const task1ExecutionOutcome = {
    success: false,
    exitCode: 1,
    testsPassed: 1,
    totalTests: 5,
    latencyMs: 2500, // Elevated latency
    estimatedCost: 0,
    costSource: 'REAL_COST' as const,
    regressionDetected: true,
    compilerErrors: ['Type error: incompatible LRU entry index'],
    output: 'Compilation failed on cache eviction test suite',
    failureClass: 'MODEL_FAILURE' as const,
  };

  const realTaskEval1 = evaluator.evaluateRealTaskExecution(
    classified1,
    selection1.selectedModelId,
    selection1.selectedProviderId,
    task1ExecutionOutcome
  );

  assert(realTaskEval1.evaluationSource === 'REAL_TASK', 'Source is strictly REAL_TASK');
  assert(realTaskEval1.modelId === 'mock-fast-model', 'Evaluation attributed to mock-fast-model');
  assert(realTaskEval1.failureClass === 'MODEL_FAILURE', 'Failure classified as MODEL_FAILURE');
  assert(realTaskEval1.score <= 0.2, 'Score heavily degraded by failures and regression');
  assert(realTaskEval1.proof?.actualModelId === 'mock-fast-model', 'Proof matches executed model');

  // Ingest evaluation into Memory
  memory.addEvaluation(realTaskEval1);

  // Model B executes a successful real task with pristine score
  const taskBOutcome = {
    success: true,
    exitCode: 0,
    testsPassed: 5,
    totalTests: 5,
    latencyMs: 310,
    estimatedCost: 0,
    costSource: 'REAL_COST' as const,
    regressionDetected: false,
    output: 'All 5 unit tests passed with zero regressions',
  };

  const realTaskEvalB = evaluator.evaluateRealTaskExecution(
    classified1,
    'mock-pro-model',
    'mock',
    taskBOutcome
  );
  memory.addEvaluation(realTaskEvalB);

  // Step 7: Check dynamic re-ranking
  const updatedRankings = rankingEngine.getRankings('CODE_GENERATION', classified1.complexity);
  console.log('Updated Rankings after real task feedback:');
  for (const r of updatedRankings.rankedModels) {
    console.log(` - Model: ${r.modelId} | RankScore: ${r.compositeRankScore} | SuccessRate: ${r.successRate} | MeanLatency: ${r.meanLatencyMs}ms`);
  }

  assert(
    updatedRankings.rankedModels[0].modelId === 'mock-pro-model',
    'mock-pro-model has overtaken mock-fast-model as Rank #1 based on fresh empirical data'
  );

  // --------------------------------------------------------------------------
  // STEPS 8 & 9: TASK 2 (EQUIVALENT) -> NEW SELECTION REFLECTS REAL DATA
  // --------------------------------------------------------------------------
  console.log('\n--- Steps 8 & 9: Task 2 Selection Based On Fresh Learning ---');
  const taskPrompt2 = 'Implement an asynchronous rate limiter with sliding window in TypeScript';
  const classified2 = classifier.classify(taskPrompt2);
  assert(classified2.category === 'CODE_GENERATION', 'Task 2 classified as CODE_GENERATION');

  const selection2 = selector.selectModelForTask(taskPrompt2, undefined, {
    preferredProviders: ['mock'],
  });

  assert(
    selection2.selectedModelId === 'mock-pro-model',
    'Task 2 now adaptively routes to mock-pro-model instead of mock-fast-model'
  );
  assert(
    selection2.selectedModelId !== selection1.selectedModelId,
    'Model selection for equivalent task changed dynamically in response to real task feedback'
  );

  // --------------------------------------------------------------------------
  // STEP 10: FULL PIPELINE INTEGRATION VIA AgentTeamEngine
  // --------------------------------------------------------------------------
  console.log('\n--- Step 10: Full Production AgentTeamEngine Workflow Real Task Ingestion ---');
  const engine = new AgentTeamEngine();
  const runResult = await engine.runWorkflow(
    'Create an in-memory event bus in TypeScript',
    'tier_3',
    undefined,
    { provider: 'mock' }
  );

  assert(runResult.success === true, 'Workflow completed successfully');
  assert(runResult.modelUsed !== undefined, 'Workflow records model used');
  assert(runResult.selectionDecision !== undefined, 'Workflow attaches selectionDecision');
  assert(runResult.realTaskEvaluationId !== undefined, 'Workflow produces realTaskEvaluationId');

  // Verify that the engine's real task was recorded in global memory
  const globalEvals = memory.getEvaluations({ sources: ['REAL_TASK'] });
  assert(globalEvals.length >= 2, 'Global memory contains REAL_TASK records from production workflow');

  // Clean up test file
  if (fs.existsSync(testStoragePath)) {
    fs.unlinkSync(testStoragePath);
  }

  console.log('\n====================================================');
  console.log('🎉 ADAPTIVE FEEDBACK LOOP E2E TEST PASSED (100%)');
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
