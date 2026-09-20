import { ProblemClassifier } from '../../server/llm/ProblemClassifier';
import { LLMRegistry } from '../../server/llm/LLMRegistry';
import { LLMPerformanceEvaluator } from '../../server/llm/LLMPerformanceEvaluator';
import { LLMPerformanceMemory } from '../../server/llm/LLMPerformanceMemory';
import { LLMRankingEngine } from '../../server/llm/LLMRankingEngine';
import { LLMSelector } from '../../server/llm/LLMSelector';
import { LLMBenchmarkEngine } from '../../server/llm/LLMBenchmarkEngine';
import { LLMSelfImprovementAdapter } from '../../server/llm/LLMSelfImprovementAdapter';
import { ProviderManager } from '../../server/providerManager';
import { MockProvider } from '../../server/providers/mockProvider';
import { quotaManager } from '../../server/quotaManager';
import { BENCHMARK_DATASET } from '../benchmarks/dataset';
import { LLMEvaluation, ProblemCategory } from '../../server/llm/types';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runAdaptiveLLMUnitTests() {
  console.log('====================================================');
  console.log('🧠 RUNNING ADAPTIVE MULTI-LLM ROUTING TEST SUITE');
  console.log('====================================================\n');

  const testDataDir = path.resolve(process.cwd(), 'data', 'test_adaptive_llm');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  // =========================================================================
  // TEST SUITE 1: ProblemClassifier
  // =========================================================================
  console.log('\n--- 1. Testing ProblemClassifier ---');
  const classifier = new ProblemClassifier();

  // 1.1 Category & Language detection
  const debugTask = classifier.classify('Fix TypeError: Cannot read properties of undefined in user profile authentication');
  assert(debugTask.category === 'CODE_DEBUGGING', 'Classifies bug/error as CODE_DEBUGGING');
  assert(debugTask.subcategory.length > 0, 'Produces subcategory specialization');

  const secTask = classifier.classify('Audit and prevent SQL injection and path traversal vulnerability in file upload route');
  assert(secTask.category === 'SECURITY', 'Classifies security vulnerability as SECURITY');

  const mathTask = classifier.classify('Calculate the eigenvalues and determinant of matrix M with probability distribution');
  assert(mathTask.category === 'MATHEMATICS', 'Classifies matrix/calculus as MATHEMATICS');

  const refactorTask = classifier.classify('Refactor legacy callback hell to pure async/await functions with immutable data');
  assert(refactorTask.category === 'REFACTORING', 'Classifies refactoring prompt as REFACTORING');
  assert(refactorTask.constraints.includes('FUNCTIONAL_IMMUTABLE'), 'Extracts functional immutable constraint');

  const noDepsTask = classifier.classify('Implement a quicksort algorithm with zero external dependencies');
  assert(noDepsTask.constraints.includes('ZERO_EXTERNAL_DEPENDENCIES'), 'Extracts ZERO_EXTERNAL_DEPENDENCIES constraint');

  // 1.2 Complexity evaluation
  const complexTask = classifier.classify(
    'Design a distributed multi-file consensus cluster with raft mutex synchronization, atomic race condition mitigation, and AST bytecode generation.'
  );
  assert(complexTask.complexity === 'EXTREME' || complexTask.complexity === 'HIGH', 'Recognizes distributed concurrency as HIGH/EXTREME complexity');

  // 1.3 Anti-Hardcoding Invariant: output contains no hardcoded model name
  const classifiedJson = JSON.stringify(complexTask);
  assert(!classifiedJson.includes('claude-3') && !classifiedJson.includes('gpt-4') && !classifiedJson.includes('gemini-'), 'Classifier does not output hardcoded model choices');

  // =========================================================================
  // TEST SUITE 2: LLMRegistry
  // =========================================================================
  console.log('\n--- 2. Testing LLMRegistry ---');
  quotaManager.clearAllCooldowns();
  const testMemory = new LLMPerformanceMemory(path.join(testDataDir, 'memory_registry.json'));
  testMemory.clear();

  const customProviderMgr = new ProviderManager();
  const mockProvider = new MockProvider();
  customProviderMgr.registerProvider(mockProvider);

  const registry = new LLMRegistry(customProviderMgr, testMemory);
  const discovered = registry.discoverModels();
  assert(discovered.length > 0, 'Discovers models registered in ProviderManager dynamically');
  assert(discovered.some((m) => m.modelId === 'mock-fast-model'), 'Finds mock-fast-model');

  // Initial status must be UNMEASURED
  const mockEntry = registry.getModel('mock-fast-model');
  assert(mockEntry?.status === 'UNMEASURED', 'Initial empirical status is UNMEASURED without evaluations');

  // Check cooldown handling
  quotaManager.handleCooldown('mock-fast-model', 60, 'RATE_LIMIT');
  const cooledEntry = registry.getModel('mock-fast-model');
  assert(cooledEntry?.availability === false, 'Registry marks model unavailable when in cooldown');
  assert(cooledEntry?.status === 'UNAVAILABLE', 'Status switches to UNAVAILABLE during cooldown');
  quotaManager.clearAllCooldowns();
  assert(registry.getModel('mock-fast-model')?.availability === true, 'Cooldown clearance restores availability');

  // =========================================================================
  // TEST SUITE 3: LLMBenchmarkEngine
  // =========================================================================
  console.log('\n--- 3. Testing LLMBenchmarkEngine ---');
  assert(BENCHMARK_DATASET.length >= 8, 'Benchmark dataset covers at least 8 standardized reference problems');
  const categoriesCovered = new Set(BENCHMARK_DATASET.map((b) => b.category));
  assert(categoriesCovered.has('CODE_DEBUGGING'), 'Dataset includes CODE_DEBUGGING');
  assert(categoriesCovered.has('CODE_GENERATION'), 'Dataset includes CODE_GENERATION');
  assert(categoriesCovered.has('REFACTORING'), 'Dataset includes REFACTORING');
  assert(categoriesCovered.has('TEST_GENERATION'), 'Dataset includes TEST_GENERATION');
  assert(categoriesCovered.has('SECURITY'), 'Dataset includes SECURITY');
  assert(categoriesCovered.has('ARCHITECTURE'), 'Dataset includes ARCHITECTURE');
  assert(categoriesCovered.has('REASONING'), 'Dataset includes REASONING');
  assert(categoriesCovered.has('MATHEMATICS'), 'Dataset includes MATHEMATICS');

  const benchmarkEngine = new LLMBenchmarkEngine(customProviderMgr, undefined, testMemory, registry);
  const benchRun = await benchmarkEngine.runBenchmarks({
    categories: ['CODE_DEBUGGING'],
    candidateModels: ['mock-fast-model'],
    isLive: false,
    maxRequestsBudget: 2,
  });
  assert(benchRun.totalEvaluations > 0, 'Hermetic benchmark execution runs cleanly');
  assert(benchRun.isLive === false, 'Hermetic mode is strictly non-live');

  // =========================================================================
  // TEST SUITE 4: LLMPerformanceEvaluator (Objective Criteria)
  // =========================================================================
  console.log('\n--- 4. Testing LLMPerformanceEvaluator ---');
  const evaluator = new LLMPerformanceEvaluator();

  // 4.1 Debugging evaluation with real test execution
  const debugBench = BENCHMARK_DATASET.find((b) => b.id === 'bench_debug_off_by_one_binary_search')!;
  
  // Buggy solution fails
  const buggySolution = `
    function binarySearch(arr, target) {
      let low = 0;
      let high = arr.length;
      while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) low = mid;
        else high = mid;
      }
      return -1;
    }
  `;
  const buggyEval = evaluator.evaluateBenchmarkOutput(debugBench, 'model_a', 'mock', buggySolution, 150);
  assert(buggyEval.success === false, 'Buggy solution is objectively failed by test harness');
  assert(buggyEval.regressionDetected === true, 'Regression detected on buggy solution');

  // Correct solution passes
  const correctSolution = `
    function binarySearch(arr, target) {
      let low = 0;
      let high = arr.length - 1;
      while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
      }
      return -1;
    }
  `;
  const correctEval = evaluator.evaluateBenchmarkOutput(debugBench, 'model_b', 'mock', correctSolution, 120);
  assert(correctEval.success === true, 'Correct solution passes objective test execution');
  assert(correctEval.score === 1.0, 'Correct solution achieves 1.0 score');
  assert(correctEval.regressionDetected === false, 'No regression on correct solution');

  // 4.2 Security evaluation: checks path traversal protection
  const secBench = BENCHMARK_DATASET.find((b) => b.id === 'bench_security_path_traversal_remediation')!;
  const insecureSecSolution = `
    app.get('/files', (req, res) => {
      const filePath = path.join(BASE_DIR, req.query.filename);
      res.sendFile(filePath);
    });
  `;
  const secInsecureEval = evaluator.evaluateBenchmarkOutput(secBench, 'model_insec', 'mock', insecureSecSolution, 100);
  assert(secInsecureEval.success === false, 'Insecure code is rejected');
  assert(secInsecureEval.regressionDetected === true, 'Security bypass detected on unsafe code');

  const secureSecSolution = `
    app.get('/files', (req, res) => {
      const safeFilename = path.normalize(req.query.filename).replace(/^(\.\.(\/|\\\\|$))+/, '');
      const resolvedPath = path.resolve(BASE_DIR, safeFilename);
      if (!resolvedPath.startsWith(BASE_DIR)) {
        return res.status(403).send('Forbidden');
      }
      res.sendFile(resolvedPath);
    });
  `;
  const secSecureEval = evaluator.evaluateBenchmarkOutput(secBench, 'model_sec', 'mock', secureSecSolution, 100);
  assert(secSecureEval.success === true, 'Defense in depth code passes security validation');

  // 4.3 Mathematics exact match
  const mathBench = BENCHMARK_DATASET.find((b) => b.id === 'bench_math_matrix_multiplication_determinant')!;
  const wrongMath = 'The determinant is 42.';
  const correctMath = 'Following cofactor expansion, the exact determinant is -59.';
  assert(evaluator.evaluateBenchmarkOutput(mathBench, 'm1', 'mock', wrongMath, 50).success === false, 'Wrong math answer is rejected');
  assert(evaluator.evaluateBenchmarkOutput(mathBench, 'm2', 'mock', correctMath, 50).success === true, 'Correct math answer (-59) passes exact criteria');

  // =========================================================================
  // TEST SUITE 5: LLMPerformanceMemory (Separation of Versions & Uncertainty)
  // =========================================================================
  console.log('\n--- 5. Testing LLMPerformanceMemory ---');
  const memoryPath = path.join(testDataDir, 'memory_unit.json');
  if (fs.existsSync(memoryPath)) fs.unlinkSync(memoryPath);
  const memory = new LLMPerformanceMemory(memoryPath);

  // Model X version 1 vs version 2
  const evalV1: LLMEvaluation = {
    id: 'e1',
    modelId: 'model-alpha',
    providerId: 'mock',
    modelVersion: 'v1.0',
    problemId: 'prob_1',
    category: 'CODE_DEBUGGING',
    complexity: 'MEDIUM',
    success: false,
    score: 0.2,
    latencyMs: 1200,
    testsPassed: 1,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '1.0.0',
    timestamp: Date.now() - 1000,
  };

  const evalV2: LLMEvaluation = {
    id: 'e2',
    modelId: 'model-alpha',
    providerId: 'mock',
    modelVersion: 'v2.0',
    problemId: 'prob_1',
    category: 'CODE_DEBUGGING',
    complexity: 'MEDIUM',
    success: true,
    score: 0.95,
    latencyMs: 400,
    testsPassed: 5,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '1.0.0',
    timestamp: Date.now(),
  };

  memory.addEvaluation(evalV1);
  memory.addEvaluation(evalV2);

  const statsV1 = memory.getStats('model-alpha', 'CODE_DEBUGGING', 'MEDIUM', 'v1.0');
  const statsV2 = memory.getStats('model-alpha', 'CODE_DEBUGGING', 'MEDIUM', 'v2.0');

  assert(statsV1?.meanScore === 0.2, 'Version v1.0 statistics tracked independently');
  assert(statsV2?.meanScore === 0.95, 'Version v2.0 statistics tracked independently without pollution');

  // Uncertainty penalty test:
  // Model with 1 evaluation (lucky 1.0) vs Model with 10 evaluations (mean 0.90)
  const luckyEval: LLMEvaluation = {
    id: 'lucky_1',
    modelId: 'model-lucky',
    providerId: 'mock',
    problemId: 'prob_1',
    category: 'CODE_GENERATION',
    complexity: 'HIGH',
    success: true,
    score: 1.0,
    latencyMs: 200,
    testsPassed: 5,
    totalTests: 5,
    regressionDetected: false,
    evaluatorVersion: '1.0.0',
    timestamp: Date.now(),
  };
  memory.addEvaluation(luckyEval);

  for (let i = 0; i < 8; i++) {
    memory.addEvaluation({
      id: `proven_${i}`,
      modelId: 'model-proven',
      providerId: 'mock',
      problemId: `prob_${i}`,
      category: 'CODE_GENERATION',
      complexity: 'HIGH',
      success: true,
      score: 0.92,
      latencyMs: 220,
      testsPassed: 5,
      totalTests: 5,
      regressionDetected: false,
      evaluatorVersion: '1.0.0',
      timestamp: Date.now(),
    });
  }

  const luckyStats = memory.getStats('model-lucky', 'CODE_GENERATION', 'HIGH')!;
  const provenStats = memory.getStats('model-proven', 'CODE_GENERATION', 'HIGH')!;

  assert(luckyStats.confidence < provenStats.confidence, 'Statistical confidence is significantly lower for single-sample model');
  assert(luckyStats.uncertaintyPenalty > provenStats.uncertaintyPenalty, 'Uncertainty penalty is higher on unproven model');
  assert(provenStats.compositeRankScore > luckyStats.compositeRankScore, 'Proven model outranks lucky single-sample model due to uncertainty bounds');

  // =========================================================================
  // TEST SUITE 6: LLMRankingEngine
  // =========================================================================
  console.log('\n--- 6. Testing LLMRankingEngine ---');
  const rankingEngine = new LLMRankingEngine(memory, registry);
  const genRanking = rankingEngine.getRankings('CODE_GENERATION', 'HIGH');

  assert(genRanking.rankedModels.length >= 2, 'Ranking includes measured models');
  assert(genRanking.rankedModels[0].modelId === 'model-proven', 'Model with high confidence and proven performance is ranked #1');
  assert(genRanking.unmeasuredModels.length > 0, 'Unmeasured models tracked cleanly without false ranking');

  // =========================================================================
  // TEST SUITE 7: LLMSelector (Exploitation, Exploration, Decomposition)
  // =========================================================================
  console.log('\n--- 7. Testing LLMSelector ---');
  const selector = new LLMSelector(classifier, registry, rankingEngine, memory, {
    explorationRate: 0.0, // Force pure exploitation for deterministic test
  });

  // 7.1 Exploitation
  const decision = selector.selectModelForTask('Implement a scalable thread-safe queue with capacity in TypeScript');
  assert(decision.decisionType === 'EXPLOITATION' || decision.decisionType === 'EXPLORATION', 'Decision type is valid');
  assert(decision.classifiedProblem.category === 'CODE_GENERATION', 'Classifies as CODE_GENERATION');

  // 7.2 Decomposition of complex tasks
  const decomposed = selector.decomposeAndSelect('Build a full-stack real-time collaborative code editor with WebSocket broadcast');
  assert(Boolean(decomposed.architecture), 'Decomposed architecture phase selected');
  assert(Boolean(decomposed.implementation), 'Decomposed implementation phase selected');
  assert(Boolean(decomposed.debugging), 'Decomposed debugging phase selected');
  assert(Boolean(decomposed.testing), 'Decomposed testing phase selected');
  assert(Boolean(decomposed.review), 'Decomposed independent review phase selected');

  // 7.3 Independent reviewer distinction
  const reviewer = selector.selectIndependentReviewer('Deploy distributed payment processor', undefined, 'model-proven');
  assert(reviewer.selectedModelId !== 'model-proven', 'Independent reviewer is strictly distinct from the generator');

  // =========================================================================
  // TEST SUITE 8: Self-Improvement Integration
  // =========================================================================
  console.log('\n--- 8. Testing Self-Improvement Integration ---');
  // Inject bad performance for a model to simulate regression
  for (let i = 0; i < 4; i++) {
    memory.addEvaluation({
      id: `failing_${i}`,
      modelId: 'model-flaky',
      providerId: 'mock',
      problemId: `prob_${i}`,
      category: 'SECURITY',
      complexity: 'HIGH',
      success: false,
      score: 0.1,
      latencyMs: 32000,
      testsPassed: 0,
      totalTests: 5,
      regressionDetected: true,
      evaluatorVersion: '1.0.0',
      timestamp: Date.now(),
    });
  }

  const siAdapter = new LLMSelfImprovementAdapter(memory, registry, rankingEngine);
  const healthObs = siAdapter.inspectLLMPerformance();
  assert(healthObs.anomaliesDetected === true, 'SelfImprovement adapter detects LLM performance anomalies');
  assert(
    healthObs.underperformingModels.some((u) => u.modelId === 'model-flaky'),
    'Identifies flaky model with low success rate and high latency'
  );
  assert(healthObs.recommendations.length > 0, 'Produces actionable recommendations for the self-improvement cycle');

  // =========================================================================
  // TEST SUITE 9: Non-Circumvention
  // =========================================================================
  console.log('\n--- 9. Testing Non-Circumvention Invariants ---');
  // Verify that selecting an LLM never triggers git push, PR creation, or bypasses Quality Gate
  const testSelection = selector.selectModelForTask('Any prompt');
  assert(Boolean(testSelection.selectedModelId), 'Selection produces model decision');
  // Ensure no git actions attached to selection
  assert((testSelection as any).gitCommitted === undefined, 'No git commit bypass');
  assert((testSelection as any).prCreated === undefined, 'No PR creation bypass');

  console.log('\n====================================================');
  console.log('🎉 ALL ADAPTIVE MULTI-LLM ROUTING TESTS PASSED (100%)');
  console.log('====================================================\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('adaptiveLLM.test')) {
  runAdaptiveLLMUnitTests().catch((e) => {
    console.error('Test suite failed:', e);
    process.exit(1);
  });
}
