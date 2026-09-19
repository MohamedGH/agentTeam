export type ProblemSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ProblemCategory =
  | 'TEST_FAILURE'
  | 'TEST_REGRESSION'
  | 'REPETITIVE_ERROR'
  | 'SECURITY_VULNERABILITY'
  | 'BUILD_FAILURE'
  | 'LINT_FAILURE'
  | 'CODE_SMELL'
  | 'PERFORMANCE_ISSUE'
  | 'AGENT_RECURRING_FAILURE'
  | 'GIT_ERROR'
  | 'TYPE_ERROR'
  | 'DEAD_CODE'
  | 'DOCUMENTATION_GAP';

export type PlanRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type CyclePhase =
  | 'OBSERVE'
  | 'ANALYSE'
  | 'DETECT'
  | 'PLAN'
  | 'MODIFY'
  | 'TEST'
  | 'REVIEW'
  | 'QUALITY_GATE'
  | 'INTEGRATE'
  | 'OBSERVE_AGAIN';

export type CycleStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'HALTED_GATE';

export type StructuredLogEventType =
  | 'IMPROVEMENT_STARTED'
  | 'PROBLEM_DETECTED'
  | 'IMPROVEMENT_PLANNED'
  | 'IMPROVEMENT_EXECUTED'
  | 'TEST_STARTED'
  | 'TEST_COMPLETED'
  | 'REVIEW_STARTED'
  | 'REVIEW_COMPLETED'
  | 'QUALITY_GATE_PASSED'
  | 'QUALITY_GATE_FAILED'
  | 'IMPROVEMENT_INTEGRATED'
  | 'IMPROVEMENT_REJECTED'
  | 'ROLLBACK_STARTED'
  | 'ROLLBACK_COMPLETED';

export interface StructuredLogEvent {
  timestamp: string;
  event: StructuredLogEventType;
  cycleId: string;
  improvementId: string;
  message: string;
  details?: any;
}

export interface SelfImprovementConfig {
  enabled: boolean;
  mode: 'manual' | 'automatic' | 'disabled';
  maxAttempts: number;
  cooldownSeconds: number;
  autoMerge: boolean;
  requireReview: boolean;
}

export interface SystemMetric {
  name: string;
  value: number | string | boolean;
  unit?: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  details?: string;
}

export interface TestMetric {
  command: string;
  passed: boolean;
  exitCode: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  outputSnippet?: string;
  durationMs: number;
}

export interface BuildMetric {
  command: string;
  passed: boolean;
  exitCode: number;
  outputSnippet?: string;
  durationMs: number;
}

export interface LintMetric {
  command: string;
  passed: boolean;
  exitCode: number;
  outputSnippet?: string;
  durationMs: number;
}

export interface AgentMetric {
  totalRuns: number;
  successRate: number;
  failureCount: number;
  avgDurationMs: number;
  modelsUsed: string[];
  lastError?: string;
}

export interface SecurityIssue {
  file: string;
  line?: number;
  rule: string;
  description: string;
  severity: ProblemSeverity;
  snippet?: string;
}

export interface CodeSmell {
  file: string;
  line?: number;
  type: string;
  message: string;
}

export interface ObservationSnapshot {
  id: string;
  timestamp: string;
  workingDirectory: string;
  repository: string;
  branch: string;
  tests: TestMetric;
  build?: BuildMetric;
  lint?: LintMetric;
  agentMetrics?: AgentMetric;
  codeStats: {
    totalFiles: number;
    sourceFiles: number;
    testFiles: number;
    todoCount: number;
  };
  security: {
    issues: SecurityIssue[];
    clean: boolean;
  };
  codeSmells: CodeSmell[];
  git: {
    isGitRepo: boolean;
    clean: boolean;
    uncommittedFiles: string[];
    headSha?: string;
  };
  runtimeHealth: {
    providerFailovers: number;
    lastError?: string;
  };
}

export interface DetectedProblem {
  id: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  title: string;
  description: string;
  targetFiles: string[];
  suggestedFix: string;
  confidence: number; // 0 to 1
  sourceSnapshotId: string;
}

export interface PlanStep {
  stepNumber: number;
  description: string;
  targetFile: string;
  action: 'MODIFY' | 'CREATE' | 'DELETE' | 'PATCH';
  contentOrPatch?: string;
  validationCheck?: string;
}

export interface ImprovementPlan {
  id: string;
  problemId: string;
  problemTitle: string;
  title: string;
  objective: string;
  probableCause: string;
  proposedImprovement: string;
  riskLevel: PlanRiskLevel;
  steps: PlanStep[];
  verificationCommand: string;
  targetFiles: string[];
  successCriteria: string[];
  requiredTests: string[];
  risks: string[];
  rollbackStrategy: string;
  createdAt: string;
}

export interface FileModificationRecord {
  file: string;
  action: 'MODIFIED' | 'CREATED' | 'DELETED';
  backupPath?: string;
  diffSnippet?: string;
}

export interface ExecutionResult {
  success: boolean;
  planId: string;
  appliedSteps: number;
  totalSteps: number;
  modifiedFiles: FileModificationRecord[];
  backupId: string;
  error?: string;
  durationMs: number;
}

export interface EvaluationResult {
  passed: boolean;
  testsPassed: boolean;
  testExitCode: number;
  testOutput: string;
  reviewApproved: boolean;
  reviewIssues: string[];
  gateAuthorized: boolean;
  gateReason?: string;
  regressionDetected: boolean;
  summary: string;
}

export interface SelfImprovementOptions {
  workingDirectory?: string;
  repository?: string;
  branch?: string;
  testCommand?: string;
  autoIntegrate?: boolean;
  commitAndPush?: boolean;
  createPullRequest?: boolean;
  isSimulation?: boolean;
  agentId?: 'jules' | 'mock' | 'internal';
  targetCategories?: ProblemCategory[];
}

export interface ImprovementMemoryRecord {
  id: string;
  cycleId: string;
  timestamp: string;
  problem: DetectedProblem;
  plan: ImprovementPlan;
  modifiedFiles: FileModificationRecord[];
  tests: TestMetric;
  evaluation: EvaluationResult;
  outcome: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  rolledBack: boolean;
  metricsBefore: ObservationSnapshot;
  metricsAfter?: ObservationSnapshot;
  gitDelivery?: {
    delivered: boolean;
    commitSha?: string;
    pullRequestUrl?: string;
    branch?: string;
  };
}

export interface SelfImprovementCycle {
  id: string;
  startedAt: string;
  completedAt?: string;
  currentPhase: CyclePhase;
  status: CycleStatus;
  options: SelfImprovementOptions;
  initialObservation?: ObservationSnapshot;
  detectedProblems: DetectedProblem[];
  selectedProblem?: DetectedProblem;
  plan?: ImprovementPlan;
  execution?: ExecutionResult;
  evaluation?: EvaluationResult;
  gitDelivery?: {
    delivered: boolean;
    commitSha?: string;
    pullRequestUrl?: string;
    branch?: string;
  };
  postObservation?: ObservationSnapshot;
  verifiedFixed?: boolean;
  error?: string;
  log: Array<{
    timestamp: string;
    phase: CyclePhase;
    message: string;
    details?: any;
  }>;
  structuredLogs: StructuredLogEvent[];
}
