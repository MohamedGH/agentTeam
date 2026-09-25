import fs from 'fs';
import path from 'path';
import { ObservationCollector, observationCollector as defaultCollector } from './ObservationCollector';
import { ProblemDetector, problemDetector as defaultDetector } from './ProblemDetector';
import { ImprovementPlanner, improvementPlanner as defaultPlanner } from './ImprovementPlanner';
import { ImprovementExecutor, improvementExecutor as defaultExecutor } from './ImprovementExecutor';
import { ImprovementEvaluator, improvementEvaluator as defaultEvaluator } from './ImprovementEvaluator';
import { ImprovementMemory, improvementMemory as defaultMemory } from './ImprovementMemory';
import { workflowOrchestrator, WorkflowOrchestrator } from '../workflowOrchestrator';
import {
  SelfImprovementCycle,
  SelfImprovementOptions,
  SelfImprovementConfig,
  CyclePhase,
  CycleStatus,
  DetectedProblem,
  ImprovementPlan,
  ExecutionResult,
  EvaluationResult,
  ObservationSnapshot,
  StructuredLogEventType,
  StructuredLogEvent,
} from './types';

export type SelfImprovementEventListener = (event: {
  cycleId: string;
  phase: CyclePhase;
  status: CycleStatus;
  message: string;
  details?: any;
}) => void;

export class SelfImprovementEngine {
  private observer: ObservationCollector;
  private detector: ProblemDetector;
  private planner: ImprovementPlanner;
  private executor: ImprovementExecutor;
  private evaluator: ImprovementEvaluator;
  private memory: ImprovementMemory;
  private orchestrator: WorkflowOrchestrator;
  private cycles: Map<string, SelfImprovementCycle> = new Map();
  private currentCycleId: string | null = null;
  private listeners: Set<SelfImprovementEventListener> = new Set();
  private historyFile: string;
  private lastCycleCompletedAt: number = 0;
  private consecutiveFailures: number = 0;

  constructor(deps?: {
    observer?: ObservationCollector;
    detector?: ProblemDetector;
    planner?: ImprovementPlanner;
    executor?: ImprovementExecutor;
    evaluator?: ImprovementEvaluator;
    memory?: ImprovementMemory;
    orchestrator?: WorkflowOrchestrator;
    historyFile?: string;
  }) {
    this.observer = deps?.observer || defaultCollector;
    this.detector = deps?.detector || defaultDetector;
    this.planner = deps?.planner || defaultPlanner;
    this.executor = deps?.executor || defaultExecutor;
    this.evaluator = deps?.evaluator || defaultEvaluator;
    this.memory = deps?.memory || defaultMemory;
    this.orchestrator = deps?.orchestrator || workflowOrchestrator;
    this.historyFile =
      deps?.historyFile ||
      path.join(process.cwd(), 'data', 'self_improvement_history.json');
    this.loadHistory();
  }

  /**
   * Load active configuration from environment variables with fail-closed defaults.
   */
  public getConfig(): SelfImprovementConfig {
    const enabled = process.env.SELF_IMPROVEMENT_ENABLED !== 'false';
    const rawMode = (process.env.SELF_IMPROVEMENT_MODE || 'manual').toLowerCase();
    const mode =
      rawMode === 'automatic'
        ? 'automatic'
        : rawMode === 'disabled'
          ? 'disabled'
          : 'manual';
    const maxAttempts = parseInt(process.env.SELF_IMPROVEMENT_MAX_ATTEMPTS || '3', 10);
    const cooldownSeconds = parseInt(process.env.SELF_IMPROVEMENT_COOLDOWN || '10', 10);
    const autoMerge = process.env.SELF_IMPROVEMENT_AUTO_MERGE === 'true';
    const requireReview = process.env.SELF_IMPROVEMENT_REQUIRE_REVIEW !== 'false';

    return {
      enabled,
      mode,
      maxAttempts: isNaN(maxAttempts) ? 3 : Math.max(1, maxAttempts),
      cooldownSeconds: isNaN(cooldownSeconds) ? 10 : Math.max(0, cooldownSeconds),
      autoMerge,
      requireReview,
    };
  }

  /**
   * Subscribe to live self-improvement events (for SSE and UI updates).
   */
  public subscribe(listener: SelfImprovementEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(
    cycleId: string,
    phase: CyclePhase,
    status: CycleStatus,
    message: string,
    details?: any
  ) {
    for (const listener of this.listeners) {
      try {
        listener({ cycleId, phase, status, message, details });
      } catch {
        // ignore subscriber errors
      }
    }
  }

  /**
   * Determine whether execution is authentic (realExecution) strictly from internal attributes.
   * FORBIDDEN: Blindly trusting options.realExecution or any caller-supplied flag.
   */
  public determineIsRealExecution(
    options: SelfImprovementOptions,
    snapshotId: string
  ): boolean {
    if (options.isSimulation === true) return false;
    if (options.agentId === 'mock') return false;
    if (snapshotId.includes('mock') || snapshotId.includes('simulated')) return false;
    return true;
  }

  // -------------------------------------------------------------
  // DISCRETE WORKFLOW METHODS (Section 1)
  // -------------------------------------------------------------

  public async observe(
    workingDir: string = process.cwd(),
    repository: string = 'MohamedGH/agentTeam',
    branch: string = 'main'
  ): Promise<ObservationSnapshot> {
    return this.observer.observe(workingDir, repository, branch);
  }

  public detectProblems(snapshot: ObservationSnapshot): DetectedProblem[] {
    return this.detector.detect(snapshot);
  }

  public planImprovement(problem: DetectedProblem, testCommand?: string): ImprovementPlan {
    return this.planner.plan(problem, testCommand);
  }

  public async executeImprovement(
    plan: ImprovementPlan,
    workingDir: string = process.cwd(),
    customModifier?: (file: string, content: string) => Promise<string> | string
  ): Promise<ExecutionResult> {
    return this.executor.execute(plan, workingDir, customModifier);
  }

  public async evaluateImprovement(
    workingDir: string = process.cwd(),
    modifiedFiles: any[] = [],
    isRealExecution: boolean = true,
    testCommand: string = 'npm test',
    baselineSnapshot?: ObservationSnapshot
  ): Promise<EvaluationResult> {
    return this.evaluator.evaluate(
      workingDir,
      modifiedFiles,
      isRealExecution,
      testCommand,
      baselineSnapshot
    );
  }

  public qualityGate(evaluation: EvaluationResult): boolean {
    return evaluation.passed && evaluation.gateAuthorized;
  }

  public async integrate(
    plan: ImprovementPlan,
    evaluation: EvaluationResult,
    options: SelfImprovementOptions,
    cycleId: string
  ): Promise<{ delivered: boolean; commitSha?: string; pullRequestUrl?: string; branch?: string; error?: string }> {
    const workingDir = options.workingDirectory || process.cwd();
    const repository = options.repository || 'MohamedGH/agentTeam';
    const branch = options.branch || 'main';

    // Strictly delegate delivery to WorkflowOrchestrator (Single Authority)
    const deliveryResult = await this.orchestrator.executeDelivery({
      repository,
      branch,
      workingDirectory: workingDir,
      taskPrompt: `Self-Improvement: ${plan.title}`,
      sessionId: `self_improve_${cycleId}`,
      sessionStatus: 'COMPLETED',
      executionStatus: 'COMPLETED',
      testsPassed: evaluation.testsPassed,
      reviewExecuted: true,
      reviewApproved: evaluation.reviewApproved,
      commitAndPush: options.commitAndPush !== false,
      commitPushAndCreatePR: options.createPullRequest !== false,
    });

    if (!deliveryResult.success) {
      return {
        delivered: false,
        error: deliveryResult.error,
      };
    }

    return {
      delivered: true,
      commitSha: deliveryResult.commitSha,
      pullRequestUrl: deliveryResult.pullRequestUrl,
      branch: deliveryResult.branch,
    };
  }

  public recordResult(
    cycle: SelfImprovementCycle,
    data: {
      problem: DetectedProblem;
      plan: ImprovementPlan;
      modifiedFiles: any[];
      tests: any;
      evaluation: EvaluationResult;
      outcome: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
      rolledBack: boolean;
      metricsBefore: ObservationSnapshot;
      metricsAfter?: ObservationSnapshot;
    }
  ): void {
    this.memory.record({
      cycleId: cycle.id,
      ...data,
      gitDelivery: cycle.gitDelivery,
    });
    this.saveHistory();
  }

  // -------------------------------------------------------------
  // FULL 10-PHASE CYCLE ORCHESTRATION
  // -------------------------------------------------------------

  public async runCycle(
    options: SelfImprovementOptions = {},
    customModifier?: (file: string, content: string) => Promise<string> | string
  ): Promise<SelfImprovementCycle> {
    const config = this.getConfig();

    // Check configuration guards
    if (!config.enabled || config.mode === 'disabled') {
      throw new Error('Self-Improvement Engine is currently disabled by configuration.');
    }

    // Protection against excessive consecutive failures
    if (this.consecutiveFailures >= config.maxAttempts) {
      throw new Error(
        `Self-Improvement halted: Exceeded maximum consecutive failures (${config.maxAttempts}). Reset required.`
      );
    }

    // Cooldown protection against rapid loops
    const now = Date.now();
    const cooldownMs = config.cooldownSeconds * 1000;
    if (this.lastCycleCompletedAt > 0 && now - this.lastCycleCompletedAt < cooldownMs) {
      const waitRemaining = Math.ceil((cooldownMs - (now - this.lastCycleCompletedAt)) / 1000);
      throw new Error(`Self-Improvement in cooldown. Please wait ${waitRemaining}s before next cycle.`);
    }

    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentCycleId = cycleId;

    const workingDir = options.workingDirectory || process.cwd();
    const repository = options.repository || 'MohamedGH/agentTeam';
    const branch = options.branch || 'main';
    const testCommand = options.testCommand || 'npm test';

    const cycle: SelfImprovementCycle = {
      id: cycleId,
      startedAt: new Date().toISOString(),
      currentPhase: 'OBSERVE',
      status: 'RUNNING',
      options,
      detectedProblems: [],
      log: [],
      structuredLogs: [],
    };
    this.cycles.set(cycleId, cycle);

    const logStructured = (
      event: StructuredLogEventType,
      phase: CyclePhase,
      improvementId: string,
      msg: string,
      details?: any
    ) => {
      cycle.currentPhase = phase;
      const timestamp = new Date().toISOString();
      const stLog: StructuredLogEvent = {
        timestamp,
        event,
        cycleId,
        improvementId,
        message: msg,
        details,
      };
      cycle.structuredLogs.push(stLog);
      cycle.log.push({ timestamp, phase, message: msg, details });
      this.emit(cycleId, phase, cycle.status, msg, details);
    };

    let activePlanId = 'none';

    try {
      logStructured('IMPROVEMENT_STARTED', 'OBSERVE', activePlanId, `Starting self-improvement cycle on '${repository}'...`);

      // -------------------------------------------------------------
      // 1. OBSERVE
      // -------------------------------------------------------------
      const initialSnapshot = await this.observe(workingDir, repository, branch);
      cycle.initialObservation = initialSnapshot;

      // -------------------------------------------------------------
      // 2. ANALYSE & 3. DÉTECTE
      // -------------------------------------------------------------
      let problems = this.detectProblems(initialSnapshot);

      if (options.targetCategories && options.targetCategories.length > 0) {
        problems = problems.filter((p) => options.targetCategories!.includes(p.category));
      }

      // Memory deduplication check: filter out problems whose fixes were recently rejected
      problems = problems.filter((p) => !this.memory.isRecentlyRejected(p.title, p.suggestedFix));

      cycle.detectedProblems = problems;

      if (problems.length === 0) {
        logStructured('PROBLEM_DETECTED', 'OBSERVE_AGAIN', activePlanId, 'Zero actionable unaddressed problems detected.');
        cycle.status = 'COMPLETED';
        cycle.completedAt = new Date().toISOString();
        this.lastCycleCompletedAt = Date.now();
        this.saveHistory();
        return cycle;
      }

      const selectedProblem = problems[0];
      cycle.selectedProblem = selectedProblem;
      logStructured(
        'PROBLEM_DETECTED',
        'DETECT',
        selectedProblem.id,
        `Selected priority problem: [${selectedProblem.severity}] ${selectedProblem.title}`,
        { problem: selectedProblem }
      );

      // -------------------------------------------------------------
      // 4. PLANIFIE
      // -------------------------------------------------------------
      const plan = this.planImprovement(selectedProblem, testCommand);
      activePlanId = plan.id;
      cycle.plan = plan;
      logStructured(
        'IMPROVEMENT_PLANNED',
        'PLAN',
        plan.id,
        `Improvement planned: ${plan.title} (${plan.steps.length} steps, Risk: ${plan.riskLevel})`,
        { plan }
      );

      // -------------------------------------------------------------
      // 5. MODIFIE
      // -------------------------------------------------------------
      const executionResult = await this.executeImprovement(plan, workingDir, customModifier);
      cycle.execution = executionResult;

      if (!executionResult.success) {
        cycle.status = 'FAILED';
        cycle.error = executionResult.error;
        logStructured('IMPROVEMENT_REJECTED', 'MODIFY', plan.id, `Execution failed: ${executionResult.error}`);
        this.consecutiveFailures++;
        this.recordResult(cycle, {
          problem: selectedProblem,
          plan,
          modifiedFiles: [],
          tests: initialSnapshot.tests,
          evaluation: {
            passed: false,
            testsPassed: false,
            testExitCode: 1,
            testOutput: executionResult.error || '',
            reviewApproved: false,
            reviewIssues: [executionResult.error || 'Execution failure'],
            gateAuthorized: false,
            regressionDetected: true,
            summary: executionResult.error || 'Execution failure',
          },
          outcome: 'FAILED',
          rolledBack: true,
          metricsBefore: initialSnapshot,
        });
        cycle.completedAt = new Date().toISOString();
        this.lastCycleCompletedAt = Date.now();
        return cycle;
      }

      logStructured(
        'IMPROVEMENT_EXECUTED',
        'MODIFY',
        plan.id,
        `Applied modifications across ${executionResult.modifiedFiles.length} file(s). Backup: ${executionResult.backupId}`
      );

      // -------------------------------------------------------------
      // 6. TESTE & 7. REVIEW & 8. QUALITY GATE
      // -------------------------------------------------------------
      logStructured('TEST_STARTED', 'TEST', plan.id, `Running verification command '${testCommand}'...`);

      const isRealExecution = this.determineIsRealExecution(options, initialSnapshot.id);

      logStructured('REVIEW_STARTED', 'REVIEW', plan.id, 'Performing security & architectural review on modifications...');

      const evaluation = await this.evaluateImprovement(
        workingDir,
        executionResult.modifiedFiles,
        isRealExecution,
        testCommand,
        initialSnapshot
      );
      cycle.evaluation = evaluation;

      logStructured(
        'TEST_COMPLETED',
        'TEST',
        plan.id,
        `Tests ${evaluation.testsPassed ? 'PASSED' : 'FAILED'} with exit code ${evaluation.testExitCode}`
      );
      logStructured(
        'REVIEW_COMPLETED',
        'REVIEW',
        plan.id,
        `Review ${evaluation.reviewApproved ? 'APPROVED' : 'REJECTED'}`
      );

      const gatePassed = this.qualityGate(evaluation);

      if (!gatePassed) {
        logStructured(
          'QUALITY_GATE_FAILED',
          'QUALITY_GATE',
          plan.id,
          `Quality Gate REJECTED: ${evaluation.summary}. Initiating rollback...`
        );

        // Rollback
        logStructured('ROLLBACK_STARTED', 'MODIFY', plan.id, `Rolling back changes for backup ${executionResult.backupId}...`);
        await this.executor.rollback(executionResult.backupId, workingDir);
        logStructured('ROLLBACK_COMPLETED', 'MODIFY', plan.id, `Rollback completed. Clean state restored.`);

        cycle.status = 'ROLLED_BACK';
        this.consecutiveFailures++;

        this.recordResult(cycle, {
          problem: selectedProblem,
          plan,
          modifiedFiles: executionResult.modifiedFiles,
          tests: initialSnapshot.tests,
          evaluation,
          outcome: 'ROLLED_BACK',
          rolledBack: true,
          metricsBefore: initialSnapshot,
        });

        cycle.completedAt = new Date().toISOString();
        this.lastCycleCompletedAt = Date.now();
        return cycle;
      }

      logStructured('QUALITY_GATE_PASSED', 'QUALITY_GATE', plan.id, 'Quality Gate APPROVED.');

      // -------------------------------------------------------------
      // 9. INTÈGRE
      // -------------------------------------------------------------
      const gitRequested = Boolean(
        options.autoIntegrate ||
        options.commitAndPush ||
        options.createPullRequest
      );

      if (gitRequested) {
        const delivery = await this.integrate(plan, evaluation, options, cycleId);
        if (!delivery.delivered) {
          cycle.status = 'HALTED_GATE';
          cycle.error = delivery.error;
          logStructured(
            'IMPROVEMENT_REJECTED',
            'INTEGRATE',
            plan.id,
            `WorkflowOrchestrator delivery rejected: ${delivery.error}`
          );
          this.consecutiveFailures++;
          cycle.completedAt = new Date().toISOString();
          this.lastCycleCompletedAt = Date.now();
          this.saveHistory();
          return cycle;
        }

        cycle.gitDelivery = delivery;
        logStructured(
          'IMPROVEMENT_INTEGRATED',
          'INTEGRATE',
          plan.id,
          `Successfully delivered: Commit ${delivery.commitSha || 'none'}, PR: ${delivery.pullRequestUrl || 'none'}`
        );
      } else {
        logStructured('IMPROVEMENT_INTEGRATED', 'INTEGRATE', plan.id, 'Local workspace modifications retained.');
      }

      // -------------------------------------------------------------
      // 10. OBSERVE À NOUVEAU
      // -------------------------------------------------------------
      const postSnapshot = await this.observe(workingDir, repository, branch);
      cycle.postObservation = postSnapshot;

      const remaining = this.detectProblems(postSnapshot);
      const isResolved = !remaining.some(
        (p) => p.category === selectedProblem.category && p.title === selectedProblem.title
      );

      cycle.verifiedFixed = isResolved;
      cycle.status = 'COMPLETED';
      this.consecutiveFailures = 0; // reset consecutive failure counter on success

      this.recordResult(cycle, {
        problem: selectedProblem,
        plan,
        modifiedFiles: executionResult.modifiedFiles,
        tests: postSnapshot.tests,
        evaluation,
        outcome: 'SUCCESS',
        rolledBack: false,
        metricsBefore: initialSnapshot,
        metricsAfter: postSnapshot,
      });

      cycle.completedAt = new Date().toISOString();
      this.lastCycleCompletedAt = Date.now();
      return cycle;
    } catch (err: any) {
      cycle.status = 'FAILED';
      cycle.error = err.message || 'Unknown exception in SelfImprovementEngine';
      logStructured('IMPROVEMENT_REJECTED', 'OBSERVE_AGAIN', activePlanId, `Cycle exception: ${cycle.error}`);
      this.consecutiveFailures++;
      cycle.completedAt = new Date().toISOString();
      this.lastCycleCompletedAt = Date.now();
      this.saveHistory();
      return cycle;
    } finally {
      if (this.currentCycleId === cycleId) {
        this.currentCycleId = null;
      }
    }
  }

  /**
   * Revert a previously executed cycle by its ID.
   */
  public async rollbackCycle(
    cycleId: string,
    workingDirectory: string = process.cwd()
  ): Promise<boolean> {
    const cycle = this.cycles.get(cycleId);
    if (!cycle || !cycle.execution?.backupId) return false;

    const reverted = await this.executor.rollback(cycle.execution.backupId, workingDirectory);
    if (reverted) {
      cycle.status = 'ROLLED_BACK';
      cycle.log.push({
        timestamp: new Date().toISOString(),
        phase: 'OBSERVE_AGAIN',
        message: `Cycle ${cycleId} rolled back. Workspace reverted to backup ${cycle.execution.backupId}.`,
      });
      this.emit(cycleId, 'OBSERVE_AGAIN', 'ROLLED_BACK', `Manual rollback completed for cycle ${cycleId}`);
      this.saveHistory();
    }
    return reverted;
  }

  public getCycle(cycleId: string): SelfImprovementCycle | undefined {
    return this.cycles.get(cycleId);
  }

  public getAllCycles(): SelfImprovementCycle[] {
    return Array.from(this.cycles.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getCurrentCycle(): SelfImprovementCycle | null {
    return this.currentCycleId ? this.cycles.get(this.currentCycleId) || null : null;
  }

  public resetFailureCount(): void {
    this.consecutiveFailures = 0;
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        const parsed = JSON.parse(data) as SelfImprovementCycle[];
        for (const c of parsed) {
          this.cycles.set(c.id, c);
        }
      }
    } catch {
      // ignore
    }
  }

  private saveHistory(): void {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const all = Array.from(this.cycles.values());
      fs.writeFileSync(this.historyFile, JSON.stringify(all.slice(-50), null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
}

export const selfImprovementEngine = new SelfImprovementEngine();
