import { ProblemClassifier } from '../../server/llm/ProblemClassifier';
import { LLMRegistry } from '../../server/llm/LLMRegistry';
import { LLMPerformanceEvaluator } from '../../server/llm/LLMPerformanceEvaluator';
import { LLMPerformanceMemory } from '../../server/llm/LLMPerformanceMemory';
import { LLMRankingEngine } from '../../server/llm/LLMRankingEngine';
import { LLMSelector } from '../../server/llm/LLMSelector';
import { LLMBenchmarkEngine } from '../../server/llm/LLMBenchmarkEngine';
import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { quotaManager } from '../../server/quotaManager';
import { BENCHMARK_DATASET } from '../benchmarks/dataset';
import { BenchmarkDefinition, EvaluationSource, LLMEvaluation, RandomProvider } from '../../server/llm/types';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ AUDIT ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runEmpiricalAuditedBenchmarkTests() {
  console.log('====================================================');
  console.log('🔬 RUNNING 11 EMPIRICAL BENCHMARK AUDIT REQUIREMENTS');
  console.log('====================================================\n');

  const testDataDir = path.resolve(process.cwd(), 'data', 'test_audit_suite');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  const customProviderMgr = new ProviderManager();
  const mockProvider = new MockProvider();
  customProviderMgr.registerProvider(mockProvider);

  // =========================================================================
  // REQUIREMENT 1 & 2: ZERO FAILOVER & PREUVE D'EXÉCUTION RÉELLE
  // =========================================================================
  console.log('\n--- Req 1 & 2: Benchmark Zero Failover and Proof Verification ---');
  const exactResult = await customProviderMgr.generateExactModelForBenchmark({
    providerId: 'mock',
    modelId: 'mock-fast-model',
    prompt: 'Return exact response',
    role: 'benchmark_evaluator',
  });

  assert(exactResult.requestedModelId === 'mock-fast-model', 'Proof contains requestedModelId');
  assert(exactResult.requestedProviderId === 'mock', 'Proof contains requestedProviderId');
  assert(exactResult.actualModelId === 'mock-fast-model', 'Proof contains actualModelId matching request');
  assert(exactResult.actualProviderId === 'mock', 'Proof contains actualProviderId matching request');
  assert(exactResult.failoverUsed === false, 'Proof confirms zero failover');

  // Verify that LLMPerformanceEvaluator rejects any result where failover was used
  const evaluator = new LLMPerformanceEvaluator();
  const testBench = BENCHMARK_DATASET[0];
  const invalidFailoverEval = evaluator.evaluateBenchmarkOutput(
    testBench,
    'claude-3-opus',
    'anthropic',
    'Some output text',
    500,
    0,
    true,
    {
      requestedModelId: 'claude-3-opus',
      requestedProviderId: 'anthropic',
      actualModelId: 'gpt-4o', // Mismatch / failover!
      actualProviderId: 'openai',
      failoverUsed: true,
    }
  );

  assert(invalidFailoverEval.success === false, 'Evaluation fails immediately when failover is detected');
  assert(invalidFailoverEval.score === 0, 'Score is 0 for failover execution');
  assert(invalidFailoverEval.details.failoverBlocked === true, 'Evaluation details explicitly flag failoverBlocked');

  // =========================================================================
  // REQUIREMENT 3: SÉPARATION HERMETIC VS LIVE
  // =========================================================================
  console.log('\n--- Req 3: Separation of EvaluationSource (HERMETIC vs LIVE vs REAL_TASK) ---');
  const hermeticEval = evaluator.evaluateBenchmarkOutput(testBench, 'mock-fast-model', 'mock', 'function test() { return true; }', 100, 0, false);
  assert(hermeticEval.evaluationSource === 'HERMETIC_FIXTURE', 'Non-live benchmark is tagged as HERMETIC_FIXTURE');

  const liveEval = evaluator.evaluateBenchmarkOutput(testBench, 'mock-fast-model', 'mock', 'function test() { return true; }', 100, 0, true);
  assert(liveEval.evaluationSource === 'LIVE_PROVIDER', 'Live benchmark is tagged as LIVE_PROVIDER');

  const realTaskEval = evaluator.evaluateRealTaskExecution(
    { category: 'CODE_GENERATION', complexity: 'MEDIUM', subcategory: 'API', requiredCapabilities: [], constraints: [], deterministicScore: 0.9 },
    'mock-fast-model',
    'mock',
    { success: true, latencyMs: 300, totalTests: 4, testsPassed: 4 }
  );
  assert(realTaskEval.evaluationSource === 'REAL_TASK', 'Real task execution is tagged as REAL_TASK');

  // =========================================================================
  // REQUIREMENT 4: RANKING SUR DONNÉES OPÉRATIONNELLES (REAL_TASK & LIVE_PROVIDER)
  // =========================================================================
  console.log('\n--- Req 4: Operational Data Prioritized in Rankings ---');
  const memFile = path.join(testDataDir, 'mem_req4.json');
  if (fs.existsSync(memFile)) fs.unlinkSync(memFile);
  const memory = new LLMPerformanceMemory(memFile);

  // Model A has high hermetic scores
  for (let i = 0; i < 5; i++) {
    memory.addEvaluation({
      id: `herm_${i}`,
      modelId: 'model-hermetic-only',
      providerId: 'mock',
      problemId: `prob_${i}`,
      category: 'CODE_DEBUGGING',
      complexity: 'MEDIUM',
      evaluationSource: 'HERMETIC_FIXTURE',
      success: true,
      score: 1.0,
      latencyMs: 100,
      testsPassed: 5,
      totalTests: 5,
      regressionDetected: false,
      evaluatorVersion: '2.0.0',
      timestamp: Date.now(),
    });
  }

  // Model B has real task evaluations
  for (let i = 0; i < 5; i++) {
    memory.addEvaluation({
      id: `real_${i}`,
      modelId: 'model-real-task',
      providerId: 'mock',
      problemId: `prob_${i}`,
      category: 'CODE_DEBUGGING',
      complexity: 'MEDIUM',
      evaluationSource: 'REAL_TASK',
      success: true,
      score: 0.9,
      latencyMs: 200,
      testsPassed: 5,
      totalTests: 5,
      regressionDetected: false,
      evaluatorVersion: '2.0.0',
      timestamp: Date.now(),
    });
  }

  const rankingEngine = new LLMRankingEngine(memory, new LLMRegistry(customProviderMgr, memory));
  const operationalRanking = rankingEngine.getRankings('CODE_DEBUGGING', 'MEDIUM');
  
  // Operational ranking should have model-real-task at top, not model-hermetic-only
  assert(operationalRanking.rankedModels[0].modelId === 'model-real-task', 'Operational ranking prioritizes REAL_TASK data over hermetic fixtures');

  // =========================================================================
  // REQUIREMENT 5: MULTI-MODÈLES PAR PROVIDER & GESTION DES VERSIONS
  // =========================================================================
  console.log('\n--- Req 5: Version Isolation in Performance Memory ---');
  const v1Eval: LLMEvaluation = {
    id: 'v1_eval',
    modelId: 'gpt-4o',
    modelVersion: '2024-08-06',
    providerId: 'mock',
    problemId: 'p1',
    category: 'SECURITY',
    complexity: 'HIGH',
    evaluationSource: 'REAL_TASK',
    success: false,
    score: 0.3,
    latencyMs: 1500,
    testsPassed: 1,
    totalTests: 3,
    regressionDetected: true,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  };

  const v2Eval: LLMEvaluation = {
    id: 'v2_eval',
    modelId: 'gpt-4o',
    modelVersion: '2024-11-20',
    providerId: 'mock',
    problemId: 'p1',
    category: 'SECURITY',
    complexity: 'HIGH',
    evaluationSource: 'REAL_TASK',
    success: true,
    score: 0.98,
    latencyMs: 500,
    testsPassed: 3,
    totalTests: 3,
    regressionDetected: false,
    evaluatorVersion: '2.0.0',
    timestamp: Date.now(),
  };

  memory.addEvaluation(v1Eval);
  memory.addEvaluation(v2Eval);

  const statsV1 = memory.getStats('gpt-4o', 'SECURITY', 'HIGH', '2024-08-06');
  const statsV2 = memory.getStats('gpt-4o', 'SECURITY', 'HIGH', '2024-11-20');

  assert(statsV1?.meanScore === 0.3, 'Version 2024-08-06 preserves its independent score');
  assert(statsV2?.meanScore === 0.98, 'Version 2024-11-20 tracks independent improvements');

  // =========================================================================
  // REQUIREMENT 6: DIFFICULTÉ DES BENCHMARKS (48 benchmarks, 8 categories)
  // =========================================================================
  console.log('\n--- Req 6: 48 Benchmarks and Difficulty-Stratified Rankings ---');
  assert(BENCHMARK_DATASET.length >= 48, `Dataset contains 48 benchmarks (actual: ${BENCHMARK_DATASET.length})`);
  const difficulties = new Set(BENCHMARK_DATASET.map((b) => b.difficulty));
  assert(difficulties.has('LOW'), 'Dataset contains LOW difficulty');
  assert(difficulties.has('MEDIUM'), 'Dataset contains MEDIUM difficulty');
  assert(difficulties.has('HIGH'), 'Dataset contains HIGH difficulty');
  assert(difficulties.has('EXTREME'), 'Dataset contains EXTREME difficulty');

  // Verify difficulty-specific ranking
  const hardStat = memory.getStats('gpt-4o', 'SECURITY', 'HIGH', '2024-11-20');
  assert(hardStat?.complexity === 'HIGH', 'Ranking stats slice tracks specific complexity');

  // =========================================================================
  // REQUIREMENT 7: FAIRNESS DES BENCHMARKS (Paired Execution)
  // =========================================================================
  console.log('\n--- Req 7: Fairness and Paired Benchmark Execution ---');
  const benchEngine = new LLMBenchmarkEngine(customProviderMgr, evaluator, memory, new LLMRegistry(customProviderMgr, memory));
  const benchResult = await benchEngine.runBenchmarks({
    benchmarkIds: ['bench_debug_off_by_one_binary_search'],
    candidateModels: ['mock-fast-model', 'mock-pro-model'],
    isLive: false,
  });

  assert(benchResult.evaluations.length === 2, 'Evaluated all candidate models on identical problem');
  assert(benchResult.evaluations[0].problemId === benchResult.evaluations[1].problemId, 'Paired models evaluated on exact same problem ID');

  // =========================================================================
  // REQUIREMENT 8: ÉVALUATION CODE : EXÉCUTION RÉELLE DES TESTS (Counted Assertions)
  // =========================================================================
  console.log('\n--- Req 8: Real Test Execution with Precise Assertion Counts ---');
  const testHarnessMulti = `
    assert(typeof add === 'function', 'add is a function');
    assert(add(1, 2) === 3, '1 + 2 = 3');
    assert(add(-1, 1) === 0, '-1 + 1 = 0');
    assert(add(0, 0) === 0, '0 + 0 = 0');
    assert(add(10, -5) === 5, '10 + -5 = 5');
  `;

  // Full pass: 5/5 assertions
  const fullCode = `function add(a, b) { return a + b; }`;
  const fullRes = evaluator.runTestExecution(fullCode, testHarnessMulti);
  assert(fullRes.total === 5, 'Harness executes 5 assertions');
  assert(fullRes.passed === 5, 'All 5 assertions passed');
  assert(fullRes.success === true, 'Success is true when 5/5 pass');

  // Partial pass: 2/5 assertions pass (e.g. failing for negatives)
  const partialCode = `function add(a, b) { return (a > 0 && b > 0) ? a + b : 999; }`;
  const partialRes = evaluator.runTestExecution(partialCode, testHarnessMulti);
  assert(partialRes.total === 5, 'Partial failure still evaluates total count');
  assert(partialRes.passed < 5, 'Passed count reflects actual passed assertions');
  assert(partialRes.success === false, 'Partial pass is marked unsuccessful');

  // =========================================================================
  // REQUIREMENT 9: SÉCURITÉ DE L'ÉVALUATEUR (Sandbox Isolation & Fail-Closed)
  // =========================================================================
  console.log('\n--- Req 9: Sandbox Isolation & Fail-Closed Security ---');
  const maliciousCodeProcess = `function add(a, b) { process.exit(1); return a + b; }`;
  const malRes1 = evaluator.runTestExecution(maliciousCodeProcess, testHarnessMulti);
  assert(malRes1.success === false, 'Malicious process access is blocked');
  assert(malRes1.passed === 0, 'Score is 0 for malicious process attempt');

  const maliciousCodeRequire = `function add(a, b) { require('fs').writeFileSync('/tmp/hack.txt', 'pwned'); return a + b; }`;
  const malRes2 = evaluator.runTestExecution(maliciousCodeRequire, testHarnessMulti);
  assert(malRes2.success === false, 'Malicious require access is blocked');
  assert(malRes2.passed === 0, 'Score is 0 for malicious require attempt');

  const infiniteLoopCode = `function add(a, b) { while(true) {} return a + b; }`;
  const loopRes = evaluator.runTestExecution(infiniteLoopCode, testHarnessMulti);
  assert(loopRes.success === false, 'Infinite loop timed out safely in sandbox');

  // =========================================================================
  // REQUIREMENT 10: CAPABILITIES : VRAI FILTRAGE
  // =========================================================================
  console.log('\n--- Req 10: Strict Capability Filtering in LLMRegistry ---');
  const registry = new LLMRegistry(customProviderMgr, memory);
  const toolModels = registry.getEligibleCandidates(['tools']);
  assert(toolModels.every((m) => m.capabilities.includes('tools')), 'All returned models strictly support "tools"');

  const largeCtxModels = registry.getEligibleCandidates(['large_context_window']);
  assert(largeCtxModels.every((m) => m.capabilities.includes('large_context_window')), 'All returned models support "large_context_window"');

  const impossibleModels = registry.getEligibleCandidates(['quantum_entanglement_computing']);
  assert(impossibleModels.length === 0, 'Returns 0 models when non-existent capability required');

  // =========================================================================
  // REQUIREMENT 11: SÉLECTION ET COLD START (Fair Exploration & Testable Random)
  // =========================================================================
  console.log('\n--- Req 11: Fair Cold Start Exploration & Testable RandomProvider ---');
  let deterministicStep = 0;
  const mockRandomProvider: RandomProvider = {
    next: () => {
      deterministicStep++;
      return (deterministicStep % 2 === 0) ? 0.9 : 0.1; // Alternating for testability
    },
  };

  const emptyMemFile = path.join(testDataDir, 'mem_coldstart.json');
  if (fs.existsSync(emptyMemFile)) fs.unlinkSync(emptyMemFile);
  const coldMemory = new LLMPerformanceMemory(emptyMemFile);
  const coldRanking = new LLMRankingEngine(coldMemory, registry);
  const classifier = new ProblemClassifier();

  const selector = new LLMSelector(classifier, registry, coldRanking, coldMemory, {
    explorationRate: 0.2,
  }, mockRandomProvider);

  const explorationEvents: any[] = [];
  selector.onTelemetry((e) => {
    if (e.event === 'LLM_EXPLORATION_STARTED') {
      explorationEvents.push(e);
    }
  });

  // Multiple cold start tasks in unmeasured category:
  const task1 = selector.selectModelForTask('Perform advanced topological data analysis');
  const task2 = selector.selectModelForTask('Perform another topological data analysis');

  assert(task1.decisionType === 'EXPLORATION', 'Task 1 in unmeasured category triggers EXPLORATION');
  assert(task2.decisionType === 'EXPLORATION', 'Task 2 in unmeasured category triggers EXPLORATION');
  assert(explorationEvents.some((e) => e.details?.reason === 'COLD_START_EXPLORATION'), 'Emits COLD_START_EXPLORATION telemetry');

  console.log('\n====================================================');
  console.log('🎉 ALL 11 EMPIRICAL AUDIT REQUIREMENTS FULLY SATISFIED!');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('empiricalAuditedBenchmark.test')) {
  runEmpiricalAuditedBenchmarkTests().catch((e) => {
    console.error('Audit tests failed:', e);
    process.exit(1);
  });
}
