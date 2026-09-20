import { AIProviderId } from '../providers/types';

export type ProblemCategory =
  | 'CODE_GENERATION'
  | 'CODE_DEBUGGING'
  | 'REFACTORING'
  | 'ALGORITHM'
  | 'REASONING'
  | 'MATHEMATICS'
  | 'TEST_GENERATION'
  | 'TEST_FAILURE_ANALYSIS'
  | 'SECURITY'
  | 'ARCHITECTURE'
  | 'DOCUMENTATION'
  | 'DATA_ANALYSIS'
  | 'GENERAL_TASK';

export type ProblemComplexity = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export type LLMStatus = 'UNMEASURED' | 'LOW_CONFIDENCE' | 'MEASURED' | 'UNAVAILABLE';

export interface ClassifiedProblem {
  category: ProblemCategory;
  subcategory: string;
  complexity: ProblemComplexity;
  requiredCapabilities: string[];
  constraints: string[];
  detectedLanguages?: string[];
  estimatedTokens?: number;
  rawInputSnippet?: string;
  deterministicScore: number;
}

export interface LLMModelEntry {
  providerId: AIProviderId;
  modelId: string;
  version?: string;
  capabilities: string[];
  availability: boolean;
  configuration?: Record<string, any>;
  costTier?: 'flash' | 'pro' | 'ultra' | 'custom';
  contextWindow?: number;
  status: LLMStatus;
  evaluationHistoryCount: number;
  lastEvaluatedAt?: number;
}

export interface LLMEvaluation {
  id: string;
  modelId: string;
  providerId: AIProviderId;
  modelVersion?: string;
  problemId: string;
  category: ProblemCategory;
  complexity: ProblemComplexity;
  success: boolean;
  score: number; // 0.0 to 1.0
  latencyMs: number;
  estimatedCost?: number;
  testsPassed: number;
  totalTests: number;
  regressionDetected: boolean;
  evaluatorVersion: string;
  timestamp: number;
  details?: Record<string, any>;
  isLiveBenchmark?: boolean;
  outputSample?: string;
}

export interface ModelRankingStats {
  modelId: string;
  providerId: AIProviderId;
  modelVersion?: string;
  version?: string;
  category: ProblemCategory;
  complexity?: ProblemComplexity;
  sampleCount: number;
  meanScore: number;
  successRate: number;
  meanLatencyMs: number;
  meanCost: number;
  confidence: number; // 0.0 to 1.0 (statistical confidence based on sample size and variance)
  uncertaintyPenalty: number;
  compositeRankScore: number; // UCB or Bayesian mean score penalizing high variance / low sample
  lastEvaluatedAt: number;
  status: LLMStatus;
}

export type BenchmarkEvaluationMethod =
  | 'test_execution'
  | 'exact_match'
  | 'invariant_check'
  | 'security_validation'
  | 'algorithm_oracle'
  | 'deterministic_rules';

export interface BenchmarkDefinition {
  id: string;
  name: string;
  category: ProblemCategory;
  subcategory: string;
  difficulty: ProblemComplexity;
  prompt: string;
  context?: string;
  criteria: {
    method: BenchmarkEvaluationMethod;
    expectedBehavior: string;
    testCode?: string;
    oracleFunction?: string;
    expectedExactAnswer?: string | number;
    referenceSolutions?: string[];
    forbiddenPatterns?: string[];
    requiredPatterns?: string[];
  };
}

export interface SelectionConstraints {
  maxLatencyMs?: number;
  maxCost?: number;
  requiredCapabilities?: string[];
  preferredProviders?: AIProviderId[];
  excludeModels?: string[];
  forceExploration?: boolean;
  forceModelId?: string;
}

export interface SelectionDecision {
  selectedModelId: string;
  selectedProviderId: AIProviderId;
  decisionType: 'EXPLOITATION' | 'EXPLORATION' | 'FALLBACK';
  candidateEvaluatedCount: number;
  reason: string;
  confidence: number;
  predictedScore: number;
  isEnsemble?: boolean;
  ensembleModels?: Array<{ modelId: string; providerId: AIProviderId }>;
  classifiedProblem: ClassifiedProblem;
}

export interface LLMTelemetryEvent {
  timestamp: string;
  event:
    | 'LLM_DISCOVERED'
    | 'LLM_CLASSIFIED'
    | 'LLM_BENCHMARK_STARTED'
    | 'LLM_BENCHMARK_COMPLETED'
    | 'LLM_EVALUATED'
    | 'LLM_RANKING_UPDATED'
    | 'LLM_SELECTED'
    | 'LLM_EXECUTION_COMPLETED'
    | 'LLM_PERFORMANCE_CHANGED'
    | 'LLM_EXPLORATION_STARTED'
    | 'LLM_EXPLORATION_COMPLETED';
  taskId?: string;
  modelId?: string;
  providerId?: AIProviderId;
  category?: ProblemCategory;
  evaluationId?: string;
  details?: Record<string, any>;
}

export interface LLMAdaptiveConfig {
  routingEnabled: boolean;
  benchmarkEnabled: boolean;
  benchmarkLiveEnabled: boolean;
  explorationRate: number; // e.g. 0.15 = 15% exploration
  minSamplesForConfidentRank: number; // e.g. 3 or 5
  maxBenchmarkRequests: number;
  maxBenchmarkCost: number;
  selectionMaxCandidates: number;
  ensembleEnabled: boolean;
  ensembleMinComplexity: ProblemComplexity;
  uncertaintyDecayFactor: number;
}
