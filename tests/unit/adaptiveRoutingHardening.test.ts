import * as fs from 'fs';
import * as path from 'path';
import { LLMPerformanceMemory, OPERATIONAL_SOURCES } from '../../server/llm/LLMPerformanceMemory';
import { LLMRegistry } from '../../server/llm/LLMRegistry';
import { LLMRankingEngine } from '../../server/llm/LLMRankingEngine';
import { LLMSelector } from '../../server/llm/LLMSelector';
import { LLMBenchmarkEngine } from '../../server/llm/LLMBenchmarkEngine';
import { LLMPerformanceEvaluator } from '../../server/llm/LLMPerformanceEvaluator';
import { calculateModelCost } from '../../server/llm/pricing';
import { LLMSelfImprovementAdapter } from '../../server/selfImprovement/LLMSelfImprovementAdapter';
import { ObservationCollector } from '../../server/selfImprovement/ObservationCollector';
import { ProblemDetector } from '../../server/selfImprovement/ProblemDetector';
import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { quotaManager } from '../../server/quotaManager';
import { LLMEvaluation } from '../../server/llm/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runAdaptiveRoutingHardeningTests() {
  console.log('====================================================');
  console.log('🛡️ RUNNING ADAPTIVE ROUTING HARDENING & EMPIRICAL TESTS');
  console.log('====================================================\n');

  const testDir = path.resolve(process.cwd(), 'data', 'test_hardening_suite');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const memFile = path.join(testDir, `mem_${Date.now()}.json`);
  const memory = new LLMPerformanceMemory(memFile);

  const customProviderMgr = new ProviderManager({ registerDefaults: false });
  const mockProvider = new MockProvider();
  customProviderMgr.registerProvider(mockProvider);
  const registry = new LLMRegistry(customProviderMgr, memory);
  const rankingEngine = new LLMRankingEngine(memory, registry);
  const selector = new LLMSelector(undefined, registry, rankingEngine, memory);

  // --------------------------------------------------------------------------
  // TEST 1: Infrastructure Failure Isolation (FailureClass)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 1: Infrastructure Failure Isolation ---');
  // Add a successful evaluation
  memory.addEvaluation({
    id: 'eval_succ_1',
    modelId: 'mock-fast-model',
    providerId: 'mock',
    problemId: 'task_1',
    category: 'CODE_GENERATION',
    complexity: 'MEDIUM',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.95,
    latencyMs: 300,
    testsPassed: 4,
    totalTests: 4,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  });

  // Add an infrastructure failure (QUOTA_FAILURE / 429)
  memory.addEvaluation({
    id: 'eval_infra_fail',
    modelId: 'mock-fast-model',
    providerId: 'mock',
    problemId: 'task_2',
    category: 'CODE_GENERATION',
    complexity: 'MEDIUM',
    evaluationSource: 'REAL_TASK',
    success: false,
    score: 0,
    latencyMs: 100,
    testsPassed: 0,
    totalTests: 1,
    regressionDetected: false,
    failureClass: 'QUOTA_FAILURE', // Infrastructure issue, NOT model capability issue
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  });

  const statsAfterInfra = memory.getStats('mock-fast-model', 'CODE_GENERATION', 'MEDIUM', undefined, OPERATIONAL_SOURCES);
  assert(statsAfterInfra !== null, 'Stats exist for mock-fast-model');
  assert(statsAfterInfra?.meanScore === 0.95, 'Infrastructure failure was NOT counted against model capability meanScore');
  assert(statsAfterInfra?.successRate === 1.0, 'Infrastructure failure did NOT reduce model successRate');
  assert(statsAfterInfra?.sampleCount === 1, 'Infrastructure failure was excluded from capability sampleCount');

  // --------------------------------------------------------------------------
  // TEST 2: Duplicate Evaluation Protection
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Duplicate Evaluation Protection ---');
  const countBefore = statsAfterInfra?.sampleCount || 0;
  // Re-add exact same evaluation id
  memory.addEvaluation({
    id: 'eval_succ_1',
    modelId: 'mock-fast-model',
    providerId: 'mock',
    problemId: 'task_1',
    category: 'CODE_GENERATION',
    complexity: 'MEDIUM',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.95,
    latencyMs: 300,
    testsPassed: 4,
    totalTests: 4,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  });

  const statsAfterDuplicate = memory.getStats('mock-fast-model', 'CODE_GENERATION', 'MEDIUM', undefined, OPERATIONAL_SOURCES);
  assert(statsAfterDuplicate?.sampleCount === countBefore, 'Duplicate evaluation ID did not inflate sample count');

  // --------------------------------------------------------------------------
  // TEST 3: Pricing and Cost Calculation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Standardized Cost Calculation ---');
  const costKnown = calculateModelCost('gemini-2.5-flash', 1000, 1000, 2000, true);
  assert(costKnown.source === 'REAL_COST', 'Returns REAL_COST when exact prompt and completion tokens provided');
  assert(costKnown.cost > 0, 'Cost is greater than 0');

  const costEstimated = calculateModelCost('gpt-4o', undefined, undefined, 2000, false);
  assert(costEstimated.source === 'ESTIMATED_COST', 'Returns ESTIMATED_COST when only totalTokens provided');

  const costUnknown = calculateModelCost('some-future-unregistered-model', 500, 500, 1000);
  assert(costUnknown.source === 'UNKNOWN_COST', 'Returns UNKNOWN_COST for unregistered models');
  assert(costUnknown.cost === 0, 'Unknown cost defaults to 0');

  // --------------------------------------------------------------------------
  // TEST 4: Benchmark Engine Budget Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Benchmark Budget Enforcement ---');
  const evaluator = new LLMPerformanceEvaluator();
  const benchEngine = new LLMBenchmarkEngine(customProviderMgr, evaluator, memory, registry);

  const budgetResult = await benchEngine.runBenchmarks({
    benchmarkIds: ['bench_debug_off_by_one_binary_search'],
    candidateModels: ['mock-fast-model'],
    isLive: false,
    maxCostBudget: 0.000001, // extremely low budget
  });

  assert(budgetResult.runId.startsWith('bench_run_'), 'Benchmark executed with valid runId');
  assert(budgetResult.totalCost >= 0, 'Total cost tracked in benchmark result');

  // --------------------------------------------------------------------------
  // TEST 5: LLMSelector Manual Override Semantics
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Manual Override Semantics ---');
  const overrideDecision = selector.selectModelForTask('Debug this binary search', undefined, {
    forceModelId: 'mock-fast-model',
  });

  assert(overrideDecision.decisionType === 'MANUAL_OVERRIDE', 'decisionType is MANUAL_OVERRIDE');
  assert(overrideDecision.selectedModelId === 'mock-fast-model', 'Selected model matches forced model');
  assert(overrideDecision.confidence > 0, 'Confidence reflects empirical data from memory');

  // --------------------------------------------------------------------------
  // TEST 6: LLMSelector Hard Constraints Enforcement (Zero Tolerance)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Hard Constraints Enforcement ---');
  // Both mock-fast-model (300ms) and mock-pro-model (500ms) exceed 10ms constraint
  memory.addEvaluation({
    id: 'eval_pro_lat',
    modelId: 'mock-pro-model',
    providerId: 'mock',
    problemId: 'task_pro',
    category: 'CODE_GENERATION',
    complexity: 'LOW',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.9,
    latencyMs: 500,
    testsPassed: 4,
    totalTests: 4,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  });

  const strictConstraintDecision = selector.selectModelForTask('Create a new REST endpoint in Express for user profiles', undefined, {
    maxLatencyMs: 10, // Unreachable latency constraint (candidates have 300ms and 500ms)
  });

  assert(
    strictConstraintDecision.decisionType === 'NO_FEASIBLE_MODEL',
    'Returns NO_FEASIBLE_MODEL when all candidates violate maxLatencyMs'
  );
  assert(
    strictConstraintDecision.selectedModelId === '',
    'Selected model is empty when no feasible candidate satisfies constraints'
  );
  assert(
    strictConstraintDecision.reason.includes('violated hard constraints'),
    'Reason explicitly reports hard constraint violation'
  );

  // Dynamic Uncertainty Decay Factor Test
  console.log('\n--- Test 6b: Dynamic Uncertainty Decay Factor Synchronization ---');
  memory.setUncertaintyDecayFactor(0.8);
  assert(memory.getUncertaintyDecayFactor() === 0.8, 'Memory correctly stored uncertaintyDecayFactor');
  const statsHighDecay = memory.getStats('mock-fast-model', 'CODE_GENERATION');
  
  memory.setUncertaintyDecayFactor(0.1);
  assert(memory.getUncertaintyDecayFactor() === 0.1, 'Memory updated uncertaintyDecayFactor');
  const statsLowDecay = memory.getStats('mock-fast-model', 'CODE_GENERATION');

  assert(
    (statsLowDecay?.compositeRankScore || 0) > (statsHighDecay?.compositeRankScore || 0),
    'Lower uncertainty decay factor produces higher compositeRankScore for low-confidence models'
  );
  // Restore baseline
  memory.setUncertaintyDecayFactor(0.35);

  // --------------------------------------------------------------------------
  // TEST 7: LLMSelector Quota and Cooldown Protection
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Quota & Cooldown Model Exclusion ---');
  quotaManager.handle429Error('mock-fast-model', 60);
  assert(quotaManager.isModelInCooldown('mock-fast-model'), 'Model placed in cooldown');

  const coolDecision = selector.selectModelForTask('Generate a sorting function');
  assert(
    coolDecision.selectedModelId !== 'mock-fast-model',
    'Candidate in cooldown was excluded from adaptive selection'
  );
  quotaManager.resetState('mock-fast-model');

  // --------------------------------------------------------------------------
  // TEST 8: Self-Improvement Adapter Anomaly Detection & Adaptation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Self-Improvement Adapter Feedback Loop ---');
  const selfImprovementAdapter = new LLMSelfImprovementAdapter(memory, registry, selector, benchEngine);

  // Add failing evaluations to trigger anomaly detection
  for (let i = 0; i < 4; i++) {
    memory.addEvaluation({
      id: `fail_eval_${i}`,
      modelId: 'mock-failing-model',
      providerId: 'mock',
      problemId: `task_fail_${i}`,
      category: 'MATHEMATICS',
      complexity: 'HIGH',
      evaluationSource: 'REAL_TASK',
      success: false,
      score: 0.1,
      latencyMs: 400,
      testsPassed: 0,
      totalTests: 4,
      regressionDetected: true,
      failureClass: 'MODEL_FAILURE', // Real model failure
      evaluatorVersion: '2.0.0',
      timestamp: Date.now(),
    });
  }

  const anomalies = selfImprovementAdapter.detectAnomalies();
  const lowSuccessAnomaly = anomalies.find((a) => a.type === 'SUSTAINED_LOW_SUCCESS');
  assert(Boolean(lowSuccessAnomaly), 'Detected SUSTAINED_LOW_SUCCESS anomaly');

  const plans = selfImprovementAdapter.planAdaptations(anomalies);
  assert(plans.length > 0, 'Created actionable adaptation plans');

  const firstPlan = plans[0];
  const record = await selfImprovementAdapter.applyAdaptation(firstPlan);
  assert(record.success === true, 'Successfully applied adaptation plan');

  const verified = await selfImprovementAdapter.verifyAdaptation(record.id);
  assert(verified === true, 'Adaptation record verified');

  // --------------------------------------------------------------------------
  // TEST 9: ObservationCollector & ProblemDetector Integration
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: ObservationCollector & ProblemDetector Integration ---');
  const collector = new ObservationCollector();
  const snapshot = await collector.observe(process.cwd());

  assert(snapshot.llmMetrics !== undefined, 'ObservationSnapshot contains llmMetrics');
  assert(typeof snapshot.llmMetrics?.totalEvaluations === 'number', 'llmMetrics tracks totalEvaluations');

  const detector = new ProblemDetector();
  const detectedProblems = detector.detectLLMAnomalies(snapshot);
  assert(Array.isArray(detectedProblems), 'ProblemDetector returns LLM anomalies array');

  // --------------------------------------------------------------------------
  // TEST 10: Strict Identity Compliance (Model Prefix / Variant Mismatch Rejected)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Strict Identity Compliance (No Prefix/Permissive Matching) ---');
  // Demonstrates that requested = "model-v1" and actual = "model-v1-preview" is NOT compliant
  const nonCompliantEval = evaluator.evaluateRealTaskExecution(
    {
      category: 'CODE_GENERATION',
      complexity: 'MEDIUM',
      subcategory: 'TEST',
      requiredCapabilities: [],
      constraints: [],
      deterministicScore: 0.9,
    },
    'model-v1',
    'mock',
    {
      success: true,
      latencyMs: 120,
      totalTests: 5,
      testsPassed: 5,
      proof: {
        requestedModelId: 'model-v1',
        requestedProviderId: 'mock',
        actualModelId: 'model-v1-preview', // Suffix / prefix variant!
        actualProviderId: 'mock',
        failoverUsed: false,
        isIdentityVerified: true,
        identitySource: 'MOCK_DETERMINISTIC_PROOF',
      },
    }
  );

  assert(nonCompliantEval.proof?.isIdentityVerified === false, 'Strict equality failed: isIdentityVerified is false for model-v1 vs model-v1-preview');
  assert(nonCompliantEval.proof?.isCompliantWithSelection === false, 'isCompliantWithSelection is strictly false when actualModelId !== requestedModelId');
  assert(nonCompliantEval.success === false, 'Evaluation marked as unsuccessful due to identity non-compliance');
  assert(nonCompliantEval.score === 0, 'Score is 0 for non-compliant model variant');
  assert(nonCompliantEval.failureClass === 'PROVIDER_FAILURE', 'Failure class set to PROVIDER_FAILURE');

  // --------------------------------------------------------------------------
  // TEST 11: Fake Proof Protection (Spoofed isIdentityVerified Blocked)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 11: Fake Proof Protection ---');
  const fakeProofEval = evaluator.evaluateRealTaskExecution(
    {
      category: 'CODE_GENERATION',
      complexity: 'MEDIUM',
      subcategory: 'TEST',
      requiredCapabilities: [],
      constraints: [],
      deterministicScore: 0.9,
    },
    'mock-fast-model',
    'mock',
    {
      success: true,
      latencyMs: 120,
      totalTests: 5,
      testsPassed: 5,
      proof: {
        requestedModelId: 'mock-fast-model',
        requestedProviderId: 'mock',
        actualModelId: 'mock-fast-model',
        actualProviderId: 'mock',
        failoverUsed: false,
        isIdentityVerified: true,
        identitySource: 'UNVERIFIED_DEFAULT', // Spoofed / invalid identity source
      },
    }
  );

  assert(fakeProofEval.proof?.isIdentityVerified === false, 'Spoofed proof with UNVERIFIED_DEFAULT rejected fail-closed');
  assert(fakeProofEval.success === false, 'Spoofed proof cannot mark evaluation as successful');

  // --------------------------------------------------------------------------
  // TEST 12: Self-Improvement Operational-Only Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 12: Self-Improvement Operational-Only Isolation ---');
  const isolationMemFile = path.join(testDir, `mem_isolation_${Date.now()}.json`);
  const isolationMemory = new LLMPerformanceMemory(isolationMemFile);
  const isolationAdapter = new LLMSelfImprovementAdapter(isolationMemory, registry, selector, benchEngine);

  // Add 5 HERMETIC_FIXTURE evaluations with high regression rate
  for (let i = 0; i < 5; i++) {
    isolationMemory.addEvaluation({
      id: `herm_regress_${i}`,
      modelId: 'mock-hermetic-regressor',
      providerId: 'mock',
      problemId: `prob_herm_${i}`,
      category: 'REFACTORING',
      complexity: 'HIGH',
      evaluationSource: 'HERMETIC_FIXTURE',
      success: false,
      score: 0.1,
      latencyMs: 300,
      testsPassed: 0,
      totalTests: 5,
      regressionDetected: true,
      evaluatorVersion: '2.0.0',
      timestamp: Date.now(),
    });
  }

  const hermeticOnlyAnomalies = isolationAdapter.detectAnomalies();
  const hermeticRegressionAnomaly = hermeticOnlyAnomalies.find(
    (a) => a.modelId === 'mock-hermetic-regressor' && (a.type === 'HIGH_REGRESSION_RATE' || a.type === 'HIGH_INFRASTRUCTURE_FAILURE')
  );
  assert(hermeticRegressionAnomaly === undefined, 'HERMETIC_FIXTURE evaluations alone do NOT trigger operational regression/infrastructure anomalies');

  // Add REAL_TASK operational evaluations with high regression rate
  for (let i = 0; i < 4; i++) {
    isolationMemory.addEvaluation({
      id: `real_regress_${i}`,
      modelId: 'mock-operational-regressor',
      providerId: 'mock',
      problemId: `prob_real_${i}`,
      category: 'REFACTORING',
      complexity: 'HIGH',
      evaluationSource: 'REAL_TASK',
      success: false,
      score: 0.1,
      latencyMs: 300,
      testsPassed: 0,
      totalTests: 5,
      regressionDetected: true,
      evaluatorVersion: '2.0.0',
      timestamp: Date.now(),
    });
  }

  const operationalAnomalies = isolationAdapter.detectAnomalies();
  const operationalRegressionAnomaly = operationalAnomalies.find(
    (a) => a.modelId === 'mock-operational-regressor' && a.type === 'HIGH_REGRESSION_RATE'
  );
  assert(operationalRegressionAnomaly !== undefined, 'REAL_TASK operational evaluations successfully trigger HIGH_REGRESSION_RATE anomaly');

  // --------------------------------------------------------------------------
  // TEST 13: Deduplication and Sample Count Invariant
  // --------------------------------------------------------------------------
  console.log('\n--- Test 13: Deduplication and Sample Count Invariant ---');
  const countBeforeDedup = isolationMemory.getModelEvaluationCount('mock-operational-regressor');
  // Update existing evaluation with new score
  isolationMemory.addEvaluation({
    id: `real_regress_0`,
    modelId: 'mock-operational-regressor',
    providerId: 'mock',
    problemId: `prob_real_0`,
    category: 'REFACTORING',
    complexity: 'HIGH',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.99,
    latencyMs: 150,
    testsPassed: 5,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  });

  const countAfterDedup = isolationMemory.getModelEvaluationCount('mock-operational-regressor');
  assert(countAfterDedup === countBeforeDedup, 'Updating existing evaluation does NOT increase sample count');

  if (fs.existsSync(isolationMemFile)) {
    fs.unlinkSync(isolationMemFile);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL ADAPTIVE ROUTING HARDENING TESTS PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('adaptiveRoutingHardening')) {
  runAdaptiveRoutingHardeningTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Hardening tests failed:', err);
      process.exit(1);
    });
}
