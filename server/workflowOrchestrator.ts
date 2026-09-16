import {
  CodingAgentTask,
  CodingAgentResult,
  ExecutionStatus,
  JulesActivity,
  JulesSession,
  JulesSessionState,
  WorkflowOptions,
  WorkflowStage,
  WorkflowState,
  deriveExecutionStatus,
  isTerminalState,
} from './codingAgents/types';
import {
  ICodingAgentSessionStore,
  FileBackedCodingAgentSessionStore,
  StoredCodingSession,
} from './codingAgents/sessionStore';
import { CodingAgentManager, codingAgentManager as defaultCodingAgentManager } from './codingAgents/codingAgentManager';
import { GitHubManager, githubManager as defaultGitHubManager } from './github';
import { ProviderManager, providerManager as defaultProviderManager } from './providerManager';
import { VirtualWorkspace, workspace as defaultWorkspace } from './virtualWorkspace';
import { AgentStep, FinalReport } from '../src/types';

export interface DeterministicReviewResult {
  reviewExecuted?: boolean;
  approved: boolean;
  status: 'APPROVED' | 'CHANGES_REQUESTED';
  summary: string;
  issues: string[];
  diffLines: number;
  securityIssues: string[];
  qaPassed: boolean;
}

/**
 * WorkflowOrchestrator
 * 
 * Production-grade asynchronous workflow orchestrator for Autonomous Coding Agents (Google Jules).
 * 
 * Key capabilities:
 * 1. Continues workflow execution beyond initial HTTP response lifecycle.
 * 2. Monitors active Jules cloud sessions in the background.
 * 3. Automatically triggers Git/PR, QA testing, Reviewer, and Correction when Jules completes.
 * 4. Persists all transitions, steps, and telemetry to durable SessionStore.
 * 5. Recovers and resumes all non-terminal workflows upon server restart.
 * 6. Strictly enforces safety: NEVER pushes Git or PR before Jules COMPLETED or if FAILED/CANCELLED.
 */
export class WorkflowOrchestrator {
  private codingAgentManager: CodingAgentManager;
  private sessionStore: ICodingAgentSessionStore;
  private githubManager: GitHubManager;
  private providerManager: ProviderManager;
  private workspace: VirtualWorkspace;

  // Active in-memory tracking map (workflowId / sessionId -> WorkflowState)
  private activeWorkflows: Map<string, WorkflowState> = new Map();
  private workflowToSessionMap: Map<string, string> = new Map();
  private sessionToWorkflowMap: Map<string, string> = new Map();

  // In-flight concurrency lock to coalesce simultaneous polls for the same session/workflow
  private inFlightPolls: Map<string, Promise<WorkflowState>> = new Map();

  // Polling backoff tracking for transient errors (429, 500, 502, 503, network)
  private workflowBackoff: Map<string, { consecutiveFailures: number; nextAllowedPollTime: number }> = new Map();

  private pollerTimer: NodeJS.Timeout | null = null;
  private isPollingActive = false;
  private pollIntervalMs: number = 2500;

  constructor(options?: {
    codingAgentManager?: CodingAgentManager;
    sessionStore?: ICodingAgentSessionStore;
    githubManager?: GitHubManager;
    providerManager?: ProviderManager;
    workspace?: VirtualWorkspace;
    pollIntervalMs?: number;
  }) {
    this.codingAgentManager = options?.codingAgentManager || defaultCodingAgentManager;
    this.sessionStore = options?.sessionStore || this.codingAgentManager.getSessionStore();
    this.githubManager = options?.githubManager || this.codingAgentManager.getGitHubManager();
    this.providerManager = options?.providerManager || defaultProviderManager;
    this.workspace = options?.workspace || defaultWorkspace;
    if (options?.pollIntervalMs) {
      this.pollIntervalMs = options?.pollIntervalMs;
    }
  }

  public getSessionStore(): ICodingAgentSessionStore {
    return this.sessionStore;
  }

  public getActiveWorkflows(): WorkflowState[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Start or register a new asynchronous workflow for a Jules session.
   */
  public async startWorkflow(options: WorkflowOptions): Promise<WorkflowState> {
    const agentId = options.agent || 'jules';
    const repository = options.repositoryName || options.repository;
    const branch = options.branch || 'main';
    const taskPrompt = options.taskPrompt;

    let session: JulesSession;

    // If a session was already created, reuse it; otherwise create a new one asynchronously
    if (options.sessionId) {
      session = await this.codingAgentManager.getSession(options.sessionId, agentId);
    } else {
      console.log(`[WorkflowOrchestrator] Starting new async Jules session on agent "${agentId}" (${repository}:${branch})`);
      session = await this.codingAgentManager.startSession({
        agent: agentId,
        repository,
        branch,
        task: taskPrompt,
        title: options.title || `agentTeam: ${taskPrompt.slice(0, 50)}`,
        automationMode: options.automationMode || 'AUTO_CREATE_PR',
        requirePlanApproval: false,
      });
    }

    const workflowId = options.workflowId || `wf_${session.id.replace(/^sessions\//, '')}`;
    const cleanSessionId = session.id.replace(/^sessions\//, '');
    const now = new Date().toISOString();

    const initialSteps: AgentStep[] = [
      {
        id: `step_init_${Date.now()}`,
        phase: 1,
        phaseName: 'Task Architecture & Orchestration',
        agent: 'manager',
        thought: `Initialized asynchronous workflow ${workflowId} for task: "${taskPrompt.slice(0, 80)}" on repository ${repository} (${branch}).`,
        status: 'Workflow Dispatched',
        output: `Target: ${repository}:${branch} | Agent: ${agentId} | Mode: ${options.automationMode || 'AUTO_CREATE_PR'}`,
        timestamp: Date.now(),
      },
      {
        id: `step_dev_${Date.now()}`,
        phase: 2,
        phaseName: `Autonomous Coding Session (${agentId === 'jules' ? 'Google Jules' : 'Mock Jules'})`,
        agent: 'developer',
        thought: `Cloud session started (State: ${session.state}). Polling orchestrator assigned to monitor progress.`,
        status: `STATUS: RUNNING (${session.state})`,
        output: `Session ID: ${session.id}`,
        timestamp: Date.now(),
      },
    ];

    const workflowState: WorkflowState = {
      workflowId,
      sessionId: cleanSessionId,
      agentId,
      repository,
      branch,
      task: taskPrompt,
      title: options.title || session.title || `Task on ${repository}`,
      stage: 'JULES_RUNNING',
      status: session.state || 'QUEUED',
      executionStatus: deriveExecutionStatus(session.state, false),
      options,
      createdAt: session.createTime || now,
      updatedAt: now,
      lastPolledAt: now,
      pollCount: 0,
      prUrl: session.prUrl,
      gitBranch: session.gitBranch,
      steps: initialSteps,
      summary: session.resultSummary || `Google Jules session active (${session.state})`,
    };

    // Register mapping between workflowId and sessionId
    this.workflowToSessionMap.set(workflowId, cleanSessionId);
    this.sessionToWorkflowMap.set(cleanSessionId, workflowId);

    // Persist to session store
    await this.persistWorkflow(workflowState);

    // Register into active monitor map if non-terminal
    if (!isTerminalState(workflowState.status)) {
      this.activeWorkflows.set(cleanSessionId, workflowState);
      this.activeWorkflows.set(workflowId, workflowState);
      console.log(`[WorkflowOrchestrator] Registered active workflow ${workflowId} (Session: ${cleanSessionId})`);
      this.ensurePollerRunning();
    }

    return workflowState;
  }

  /**
   * Resume an existing workflow by sessionId or workflowId
   */
  public async resumeWorkflow(id: string): Promise<WorkflowState | null> {
    let state = await this.getWorkflow(id);

    if (!state) {
      // Check if stored session exists without workflowState yet
      const stored = await this.sessionStore.getSession(id);
      if (stored) {
        const canonicalWorkflowId = stored.metadata?.workflowId || (id.startsWith('wf_') ? id : `wf_${stored.sessionId}`);
        state = {
          workflowId: canonicalWorkflowId,
          sessionId: stored.sessionId,
          agentId: stored.agentId || 'jules',
          repository: stored.repository,
          branch: stored.branch || 'main',
          task: stored.task,
          title: stored.title,
          stage: isTerminalState(stored.status) ? (stored.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED') : 'JULES_RUNNING',
          status: stored.status,
          executionStatus: deriveExecutionStatus(stored.status, Boolean(stored.error)),
          options: {
            taskPrompt: stored.task,
            repository: stored.repository,
            branch: stored.branch,
            agent: stored.agentId,
          },
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          prUrl: stored.prUrl,
          gitBranch: stored.gitBranch,
          error: stored.error,
          summary: stored.summary,
          steps: [],
        };
      }
    }

    if (!state) {
      console.warn(`[WorkflowOrchestrator] Cannot resume workflow: session "${id}" not found.`);
      return null;
    }

    this.workflowToSessionMap.set(state.workflowId, state.sessionId);
    this.sessionToWorkflowMap.set(state.sessionId, state.workflowId);

    console.log(`[WorkflowOrchestrator] Resuming workflow ${state.workflowId} (Stage: ${state.stage}, Status: ${state.status})`);

    // If already terminal, return directly
    if (state.stage === 'COMPLETED' || state.stage === 'FAILED' || state.stage === 'CANCELLED') {
      return state;
    }

    // Register into active map and perform immediate poll
    this.activeWorkflows.set(state.sessionId, state);
    this.activeWorkflows.set(state.workflowId, state);
    this.ensurePollerRunning();

    return this.pollWorkflow(state.sessionId, { force: true });
  }

  /**
   * Poll a single workflow to check Jules status and advance downstream stages if completed.
   * Concurrency-guarded to prevent duplicate overlapping poll invocations.
   */
  public async pollWorkflow(sessionIdOrWorkflowId: string, options?: { force?: boolean }): Promise<WorkflowState> {
    const cleanSessionId = sessionIdOrWorkflowId.replace(/^sessions\//, '');
    const mappedSessionId = this.workflowToSessionMap.get(sessionIdOrWorkflowId);
    const lockKey = mappedSessionId || cleanSessionId;

    // Check concurrency lock: coalesce duplicate in-flight polls
    const existingInFlight = this.inFlightPolls.get(lockKey) || this.inFlightPolls.get(sessionIdOrWorkflowId);
    if (existingInFlight) {
      console.log(`[WorkflowOrchestrator] In-flight poll in progress for ${sessionIdOrWorkflowId}. Coalescing request.`);
      return existingInFlight;
    }

    const pollPromise = this.executePoll(sessionIdOrWorkflowId, options);
    this.inFlightPolls.set(lockKey, pollPromise);
    this.inFlightPolls.set(sessionIdOrWorkflowId, pollPromise);

    try {
      return await pollPromise;
    } finally {
      this.inFlightPolls.delete(lockKey);
      this.inFlightPolls.delete(sessionIdOrWorkflowId);
    }
  }

  /**
   * Internal polling execution with backoff and error classification
   */
  private async executePoll(sessionIdOrWorkflowId: string, options?: { force?: boolean }): Promise<WorkflowState> {
    let state = await this.getWorkflow(sessionIdOrWorkflowId);

    if (!state) {
      throw new Error(`Workflow with ID ${sessionIdOrWorkflowId} not found.`);
    }

    // Guard if already terminal
    if (state.stage === 'COMPLETED' || state.stage === 'FAILED' || state.stage === 'CANCELLED' || state.downstreamExecuted) {
      this.activeWorkflows.delete(state.sessionId);
      this.activeWorkflows.delete(state.workflowId);
      return state;
    }

    // Transient error backoff check: skip polling if within cooldown window unless force=true
    const backoff = this.workflowBackoff.get(state.sessionId);
    const now = Date.now();
    if (!options?.force && backoff && now < backoff.nextAllowedPollTime) {
      console.log(`[WorkflowOrchestrator] Backoff active for ${state.sessionId} (${Math.ceil((backoff.nextAllowedPollTime - now) / 1000)}s remaining). Skipping live poll.`);
      return state;
    }

    state.pollCount = (state.pollCount || 0) + 1;
    state.lastPolledAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    const prevStatus = state.status;

    try {
      // Query live session from agent
      const liveSession = await this.codingAgentManager.getSession(state.sessionId, state.agentId);

      // On successful poll, reset transient failure backoff
      this.workflowBackoff.delete(state.sessionId);

      state.status = liveSession.state;
      state.executionStatus = deriveExecutionStatus(liveSession.state, false);

      if (liveSession.prUrl) state.prUrl = liveSession.prUrl;
      if (liveSession.gitBranch) state.gitBranch = liveSession.gitBranch;
      if (liveSession.resultSummary) state.summary = liveSession.resultSummary;

      // Log status transition if changed
      if (prevStatus !== state.status) {
        console.log(
          `[WorkflowOrchestrator] Session ${state.sessionId} transition: ${prevStatus} -> ${state.status}`
        );
      }

      // Fetch latest activities and record new steps
      try {
        const activities = await this.codingAgentManager.listActivities(state.sessionId, state.agentId);
        if (activities && activities.length > 0) {
          const existingStepsText = new Set(state.steps.map((s) => s.thought + s.output));
          for (const act of activities) {
            const key = (act.description || '') + (act.prUrl || act.output || '');
            if (key && !existingStepsText.has(key)) {
              existingStepsText.add(key);
              state.steps.push({
                id: `step_act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                phase: 2,
                phaseName: 'Jules Activity',
                agent: 'developer',
                thought: `Jules Activity: ${act.description}`,
                status: act.actionType || 'IN_PROGRESS',
                output: act.prUrl ? `PR Created: ${act.prUrl}` : act.description,
                timestamp: act.createTime ? new Date(act.createTime).getTime() : Date.now(),
              });
            }
          }
        }
      } catch (actErr: any) {
        console.warn(`[WorkflowOrchestrator] Activity poll warning for ${state.sessionId}:`, actErr.message);
      }

      // State machine branching
      if (state.status === 'COMPLETED') {
        return await this.handleJulesCompleted(state, liveSession);
      } else if (state.status === 'FAILED') {
        const errorMsg = liveSession.resultSummary || state.error || 'Google Jules cloud execution failed.';
        return await this.handleJulesFailed(state, liveSession, errorMsg);
      } else if (state.status === 'CANCELLED') {
        return await this.handleJulesCancelled(state, liveSession);
      } else {
        // Session is still active (QUEUED, PLANNING, IN_PROGRESS, AWAITING_PLAN_APPROVAL, PAUSED)
        state.stage = state.status === 'AWAITING_PLAN_APPROVAL' ? 'AWAITING_PLAN_APPROVAL' : 'JULES_RUNNING';
        state.summary = liveSession.resultSummary || `Jules session active in cloud (${state.status})`;
        await this.persistWorkflow(state);
        return state;
      }
    } catch (pollErr: any) {
      console.error(`[WorkflowOrchestrator] Polling error on session ${state.sessionId}:`, pollErr.message);

      const errMsg = pollErr.message || '';
      const isFatal =
        errMsg.includes('404') ||
        errMsg.includes('401') ||
        errMsg.includes('403') ||
        errMsg.includes('Requested entity was not found') ||
        errMsg.includes('Not Found') ||
        errMsg.includes('Unauthorized') ||
        errMsg.includes('invalid key');

      if (isFatal) {
        this.workflowBackoff.delete(state.sessionId);
        return await this.handleJulesFailed(state, null, pollErr.message);
      }

      // For transient polling failures (e.g. 429, 500, 503, network glitch),
      // compute exponential backoff with jitter and maintain RUNNING state
      const currentFailures = (this.workflowBackoff.get(state.sessionId)?.consecutiveFailures || 0) + 1;
      const baseDelay = Math.min(60000, 2000 * Math.pow(2, currentFailures - 1));
      const jitter = Math.floor(Math.random() * 500 - 250);
      const delayMs = Math.max(1000, baseDelay + jitter);

      this.workflowBackoff.set(state.sessionId, {
        consecutiveFailures: currentFailures,
        nextAllowedPollTime: Date.now() + delayMs,
      });

      console.warn(`[WorkflowOrchestrator] Transient error on ${state.sessionId} (failures: ${currentFailures}). Backoff delay: ${delayMs}ms.`);

      state.updatedAt = new Date().toISOString();
      await this.persistWorkflow(state);
      return state;
    }
  }

  /**
   * Perform deterministic architectural code review based on test results, git diff, and security hygiene.
   */
  public performDeterministicReview(
    paramsOrTestResult: any,
    gitDiffArg?: string,
    filesChangedArg?: string[]
  ): DeterministicReviewResult {
    let testPassed: boolean;
    let gitDiff: string;
    let filesChanged: string[];

    if (typeof paramsOrTestResult === 'object' && 'testPassed' in paramsOrTestResult) {
      testPassed = Boolean(paramsOrTestResult.testPassed);
      gitDiff = paramsOrTestResult.gitDiff || '';
      filesChanged = paramsOrTestResult.filesChanged || [];
    } else {
      testPassed = Boolean(paramsOrTestResult?.success ?? (paramsOrTestResult?.exitCode === 0));
      gitDiff = gitDiffArg || '';
      filesChanged = filesChangedArg || [];
    }

    const issues: string[] = [];
    const securityIssues: string[] = [];
    const diffLines = gitDiff ? gitDiff.split('\n').filter((l) => l.trim().length > 0).length : 0;

    // 1. Tests must pass
    if (!testPassed) {
      issues.push('Automated QA test suite failed: Quality gate rejected due to test assertion or regression failures.');
    }

    const diffText = gitDiff || '';

    // 2. Detect exposed secrets / private API keys in diff
    const secretPatterns = [
      { pattern: /(?:api[_-]?key|secret[_-]?key|private[_-]?key|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{16,}['"]/i, name: 'Hardcoded credential (API key or private secret)' },
      { pattern: /ghp_[a-zA-Z0-9]{15,}/, name: 'Hardcoded credential (GitHub personal access token)' },
      { pattern: /AIza[0-9A-Za-z-_]{35}/, name: 'Hardcoded credential (Google API key)' },
      { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'Hardcoded credential (OpenAI API key)' },
      { pattern: /xox[baprs]-[0-9a-zA-Z]{10,}/, name: 'Hardcoded credential (Slack token)' },
      { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, name: 'Private cryptographic key' },
      { pattern: /Bearer\s+[a-zA-Z0-9_\-\.]{25,}/i, name: 'Hardcoded Bearer authorization token' },
      { pattern: /(?:password|client_secret)\s*[:=]\s*['"][^'"]{6,}['"]/i, name: 'Hardcoded password or secret' },
    ];

    for (const { pattern, name } of secretPatterns) {
      if (pattern.test(diffText)) {
        const msg = `Security violation: Detected ${name} in code diff.`;
        issues.push(msg);
        securityIssues.push(msg);
      }
    }

    // 3. Prohibit newly introduced .env files (except .env.example)
    for (const file of filesChanged) {
      const base = file.replace(/\\/g, '/').split('/').pop() || '';
      if ((base === '.env' || base.startsWith('.env.') || base.endsWith('.env')) && !base.endsWith('.example')) {
        const msg = `Security violation: Environment credentials file '${file}' is not permitted in workspace commits.`;
        issues.push(msg);
        securityIssues.push(msg);
      }
    }
    if (/\+\+\+ b\/.*\.env(?:\.[a-zA-Z0-9_-]+)?(?!\.example)/.test(diffText)) {
      const msg = 'Security violation: Real .env credential file detected in git diff.';
      if (!issues.includes(msg)) {
        issues.push(msg);
        securityIssues.push(msg);
      }
    }

    // 4. Prohibit dangerous shell executions
    const dangerousShell = /\b(rm\s+-rf\s+[\/\*]|curl\s+[^|\n]+\|\s*(?:ba)?sh|wget\s+[^|\n]+\|\s*(?:ba)?sh|eval\s*\(|child_process\.execSync\s*\(\s*['"]rm\s+-rf)/i;
    if (dangerousShell.test(diffText)) {
      const msg = 'Security violation: Dangerous unvalidated shell command (e.g. recursive delete, curl-to-sh, or eval) detected in diff.';
      issues.push(msg);
      securityIssues.push(msg);
    }

    // 5. Prohibit committing runtime / generated artifacts
    const prohibitedArtifacts = /\+\+\+ b\/(?:node_modules|data\/coding_agent_sessions\.json|quota_state\.json|\.DS_Store|.*\.log|.*\.tmp|dist\/)/;
    if (prohibitedArtifacts.test(diffText)) {
      const msg = 'Hygiene violation: Generated runtime artifact or system cache file detected in diff.';
      issues.push(msg);
      securityIssues.push(msg);
    }
    for (const file of filesChanged) {
      if (
        file.startsWith('node_modules/') ||
        file.startsWith('dist/') ||
        file === 'quota_state.json' ||
        file === 'data/coding_agent_sessions.json' ||
        file.endsWith('.log') ||
        file.endsWith('.tmp') ||
        file.endsWith('.DS_Store')
      ) {
        const msg = `Hygiene violation: Generated runtime artifact '${file}' detected in files changed.`;
        if (!issues.includes(msg)) {
          issues.push(msg);
          securityIssues.push(msg);
        }
      }
    }

    const approved = issues.length === 0;
    const status: 'APPROVED' | 'CHANGES_REQUESTED' = approved ? 'APPROVED' : 'CHANGES_REQUESTED';

    let summary: string;
    if (approved) {
      if (diffLines === 0) {
        summary = 'Automated architectural review passed: Empty diff, zero code modifications verified.';
      } else {
        summary = `Automated architectural review passed: ${filesChanged.length} file(s) reviewed (${diffLines} diff lines). Tests passed, no exposed credentials or unsafe patterns detected.`;
      }
    } else {
      summary = `Automated review requested changes (${issues.length} issue(s) identified): ${issues.join('; ')}`;
    }

    return {
      reviewExecuted: true,
      approved,
      status,
      summary,
      issues,
      diffLines,
      securityIssues,
      qaPassed: testPassed,
    };
  }

  /**
   * Handlers for when Jules reaches COMPLETED status.
   * Strict Mandatory Pipeline:
   * 1. Jules COMPLETED
   * 2. QA Testing (real/structured command execution)
   * 3. Deterministic Architectural Review
   * 4. Quality Gate Check (If QA fails OR Review changes requested -> halt without Git/PR)
   * 5. If QA PASS + REVIEW APPROVED -> GitHub Delivery (Commit / Push / PR)
   * 6. Honest Final Report Generation
   */
  public async handleJulesCompleted(state: WorkflowState, liveSession: JulesSession | null): Promise<WorkflowState> {
    // Safety check: handleJulesCompleted MUST only be called when status is terminal COMPLETED
    if (state.status !== 'COMPLETED') {
      console.warn(`[WorkflowOrchestrator] Safety violation: handleJulesCompleted called with non-COMPLETED status (${state.status}). Refusing downstream delivery.`);
      return state;
    }

    // Single Execution Owner: guarantee downstream execution happens EXACTLY once
    if (
      state.downstreamExecuted ||
      state.stage === 'COMPLETED' ||
      state.stage === 'FAILED' ||
      state.executionStatus === 'FAILED' ||
      state.downstreamExecuting
    ) {
      console.log(`[WorkflowOrchestrator] Downstream pipeline already executed or currently executing for ${state.sessionId}. Skipping duplicate execution.`);
      return state;
    }

    state.downstreamExecuting = true;
    console.log(`[WorkflowOrchestrator] Jules session ${state.sessionId} COMPLETED. Initiating downstream verification & delivery pipeline...`);

    const taskPrompt = state.task;
    const repoTarget = state.repository;
    const branch = state.branch || 'main';
    const targetBranch = state.gitBranch || liveSession?.gitBranch || `jules/task-${state.sessionId.slice(-6)}`;

    state.status = 'COMPLETED';
    state.updatedAt = new Date().toISOString();

    try {
      // -------------------------------------------------------------
      // 1. QUALITY ASSURANCE & TESTING (Tester Agent)
      // -------------------------------------------------------------
      state.stage = 'TESTING';
      const testCommand = state.options.testCommand || 'npm test';
      console.log(`[WorkflowOrchestrator] Running QA test validation for session ${state.sessionId} (${testCommand})...`);
      
      const testExec = this.workspace.executeCommand(testCommand);
      const testPassed = testExec.exitCode === 0 && testExec.success;
      state.testsPassed = testPassed;

      state.steps.push({
        id: `step_qa_${Date.now()}`,
        phase: 3,
        phaseName: 'Quality Assurance & Testing',
        agent: 'tester',
        thought: `Ran test suite via '${testCommand}'. Exit code: ${testExec.exitCode} (${testExec.simulated ? 'workspace simulation' : 'real execution'}). Analyzing regressions.`,
        toolCalls: [
          {
            id: `tc_test_${Date.now()}`,
            name: 'run_command',
            args: { command: testCommand },
            result: testExec.output,
            timestamp: Date.now(),
          },
        ],
        status: testPassed ? 'STATUS: PASS' : 'STATUS: FAIL (Regressions Found)',
        output: testPassed
          ? `QA test suite succeeded via '${testCommand}' (exit code: 0, ${testExec.simulated ? 'simulated' : 'real execution'}).`
          : `QA test suite failed via '${testCommand}' (exit code: ${testExec.exitCode}): ${testExec.output.slice(0, 150)}`,
        timestamp: Date.now(),
      });

      // -------------------------------------------------------------
      // 2. ARCHITECTURAL REVIEW (Reviewer Agent)
      // -------------------------------------------------------------
      state.stage = 'REVIEW';
      console.log(`[WorkflowOrchestrator] Running architectural code review for session ${state.sessionId}...`);
      const gitDiff = this.workspace.gitDiff();
      const filesChanged = Object.keys(this.workspace.getFiles());

      const reviewResult = this.performDeterministicReview({
        testPassed,
        gitDiff,
        filesChanged,
      });
      state.reviewExecuted = reviewResult.reviewExecuted;
      state.reviewApproved = reviewResult.approved;

      state.steps.push({
        id: `step_rev_${Date.now()}`,
        phase: 5,
        phaseName: 'Architectural Review',
        agent: 'reviewer',
        thought: `Evaluating code changes (${reviewResult.diffLines} lines across ${filesChanged.length} files), QA test verification, and security hygiene.`,
        toolCalls: [
          {
            id: `tc_diff_${Date.now()}`,
            name: 'git_diff',
            args: {},
            result: gitDiff ? `${reviewResult.diffLines} lines modified` : 'Empty diff',
            timestamp: Date.now(),
          },
        ],
        status: `STATUS: ${reviewResult.status}`,
        output: reviewResult.summary,
        timestamp: Date.now(),
      });

      // -------------------------------------------------------------
      // 3. QUALITY & SECURITY GATES ENFORCEMENT
      // -------------------------------------------------------------
      const gatePassed = testPassed && reviewResult.approved;

      if (!gatePassed) {
        console.warn(`[WorkflowOrchestrator] Quality/Review gate failed for session ${state.sessionId}. Blocking Git commit/push/PR.`);
        const failureReason = !testPassed
          ? `QA test validation failed (exit code ${testExec.exitCode})`
          : `Architectural review rejected: ${reviewResult.issues.join('; ')}`;

        const finalReport: FinalReport = {
          implementation: 'PASS',
          tests: testPassed ? 'PASS' : 'FAIL',
          review: reviewResult.approved ? 'APPROVED' : 'CHANGES_REQUIRED',
          filesChanged,
          testSummary: testPassed
            ? `QA test suite '${testCommand}' succeeded (exit code: 0, ${testExec.simulated ? 'simulated' : 'real'}).`
            : `QA test suite '${testCommand}' failed with exit code ${testExec.exitCode}.`,
          reviewSummary: reviewResult.summary,
          remainingIssues: [
            ...(testPassed ? [] : [`QA test suite '${testCommand}' exited with non-zero exit code (${testExec.exitCode}).`]),
            ...reviewResult.issues,
          ],
          realExecution: testExec.realExecution,
          simulated: testExec.simulated,
          totalCycles: {
            testerCorrections: 0,
            reviewerCorrections: 0,
          },
          metrics: {
            durationMs: Date.now() - new Date(state.createdAt).getTime(),
            modelUsed: state.options.model || 'gemini-3.7-flash',
            codingAgentUsed: state.agentId,
            testsPassed: false,
            reviewApproved: reviewResult.approved,
            realExecution: testExec.realExecution,
            simulated: testExec.simulated,
          },
        };

        state.finalReport = finalReport;
        state.status = 'FAILED';
        state.stage = 'FAILED';
        state.executionStatus = 'FAILED';
        state.error = `Workflow gates failed: ${failureReason}`;
        state.summary = `Workflow failed downstream quality gates. Tests: ${finalReport.tests}, Review: ${finalReport.review}. Git delivery blocked.`;
        state.downstreamExecuting = false;
        state.downstreamExecuted = true;

        state.steps.push({
          id: `step_deliv_${Date.now()}`,
          phase: 7,
          phaseName: 'Final Delivery & Gate Report',
          agent: 'manager',
          thought: `Workflow halted due to downstream quality gate failure. Git operations blocked.`,
          status: 'FAILED',
          output: `Downstream quality gates rejected: Tests: ${finalReport.tests} | Review: ${finalReport.review}. No Git commit or PR was created.`,
          timestamp: Date.now(),
        });

        await this.persistWorkflow(state);
        this.activeWorkflows.delete(state.sessionId);
        this.activeWorkflows.delete(state.workflowId);
        return state;
      }

      // -------------------------------------------------------------
      // 4. GITHUB INTEGRATION & DELIVERY (Only executed if QA + Review pass)
      // -------------------------------------------------------------
      const gitRequested = Boolean(
        state.options.git?.commit ||
        state.options.git?.push ||
        state.options.git?.createPullRequest ||
        state.options.commitAndPush ||
        state.options.commitPushAndCreatePR ||
        state.options.createRepository
      );

      if (gitRequested) {
        state.stage = 'GITHUB_DELIVERY';
        if (!this.githubManager.isConfigured()) {
          console.warn(`[WorkflowOrchestrator] GITHUB_TOKEN is not configured for requested git delivery on ${state.sessionId}`);
          state.error = 'GITHUB_TOKEN is not configured';
          state.executionStatus = 'FAILED';
          state.stage = 'FAILED';
          state.downstreamExecuting = false;
          state.downstreamExecuted = true;
          await this.persistWorkflow(state);
          this.activeWorkflows.delete(state.sessionId);
          this.activeWorkflows.delete(state.workflowId);
          return state;
        }

        console.log(`[WorkflowOrchestrator] Executing GitHub delivery for session ${state.sessionId} on ${repoTarget}...`);
        const gitRes = await this.githubManager.processTaskResult({
          repository: repoTarget,
          branch: targetBranch,
          baseBranch: branch,
          taskPrompt,
          sessionId: state.sessionId,
          sessionStatus: 'COMPLETED',
          executionStatus: 'COMPLETED',
          testsPassed: testPassed,
          reviewExecuted: reviewResult.reviewExecuted,
          reviewApproved: reviewResult.approved,
          createRepository: state.options.createRepository,
          private: state.options.private,
          git: state.options.git,
          commitAndPush: state.options.commitAndPush,
          commitPushAndCreatePR: state.options.commitPushAndCreatePR,
          testCommand: state.options.testCommand || (state.options.git?.runTests !== false ? 'npm test' : undefined),
        });

        state.git = gitRes.git;
        state.commitSha = gitRes.commitSha;
        state.commitUrl = gitRes.commitUrl;
        state.pullRequestUrl = gitRes.pullRequestUrl || liveSession?.prUrl || state.prUrl;
        state.prUrl = state.pullRequestUrl;
        state.testsPassed = gitRes.testsPassed;

        state.steps.push({
          id: `step_git_${Date.now()}`,
          phase: 6,
          phaseName: 'GitHub Workflow & Delivery',
          agent: 'developer',
          thought: `Automated Git delivery processed: commit=${Boolean(gitRes.commitSha)}, pushed=${Boolean(gitRes.commitUrl)}, PR=${state.pullRequestUrl || 'none'}`,
          status: gitRes.success ? 'STATUS: VERIFIED & DELIVERED' : 'STATUS: BLOCKED',
          output: state.pullRequestUrl
            ? `GitHub PR: ${state.pullRequestUrl} | Commit: ${gitRes.commitSha || 'latest'}`
            : `Git Commit: ${gitRes.commitSha || 'latest'} on ${targetBranch}`,
          timestamp: Date.now(),
        });

        if (!gitRes.success) {
          state.error = gitRes.error || 'GitHub workflow execution failed.';
          state.stage = 'FAILED';
          state.executionStatus = 'FAILED';
          state.downstreamExecuting = false;
          state.downstreamExecuted = true;
          await this.persistWorkflow(state);
          this.activeWorkflows.delete(state.sessionId);
          this.activeWorkflows.delete(state.workflowId);
          return state;
        }
      }

      // -------------------------------------------------------------
      // 5. FINAL DELIVERY & HONEST SYNTHESIS REPORT (Manager Agent)
      // -------------------------------------------------------------
      const finalReport: FinalReport = {
        implementation: 'PASS',
        tests: 'PASS',
        review: 'APPROVED',
        filesChanged,
        testSummary: `QA test suite '${testCommand}' succeeded (exit code: 0, ${testExec.simulated ? 'simulated' : 'real execution'}).`,
        reviewSummary: reviewResult.summary,
        remainingIssues: reviewResult.issues,
        realExecution: testExec.realExecution,
        simulated: testExec.simulated,
        totalCycles: {
          testerCorrections: 0,
          reviewerCorrections: 0,
        },
        metrics: {
          durationMs: Date.now() - new Date(state.createdAt).getTime(),
          modelUsed: state.options.model || 'gemini-3.7-flash',
          codingAgentUsed: state.agentId,
          prUrl: state.pullRequestUrl || state.prUrl,
          gitBranch: state.gitBranch,
          commitSha: state.commitSha,
          commitUrl: state.commitUrl,
          pullRequestUrl: state.pullRequestUrl || state.prUrl,
          testsPassed: true,
          reviewApproved: true,
          realExecution: testExec.realExecution,
          simulated: testExec.simulated,
          git: state.git,
        },
      };

      state.finalReport = finalReport;
      state.stage = 'COMPLETED';
      state.executionStatus = 'COMPLETED';
      state.downstreamExecuted = true;
      state.downstreamExecuting = false;
      state.summary = `Workflow completed. Implementation: ${finalReport.implementation}, Tests: ${finalReport.tests}, Review: ${finalReport.review}.${state.pullRequestUrl ? ` PR: ${state.pullRequestUrl}` : ''}`;

      state.steps.push({
        id: `step_deliv_${Date.now()}`,
        phase: 7,
        phaseName: 'Final Delivery',
        agent: 'manager',
        thought: `Autonomous workflow completed downstream verification. Implementation: ${finalReport.implementation}, Tests: ${finalReport.tests}, Review: ${finalReport.review}.`,
        status: 'COMPLETED',
        output: `Downstream execution completed. Tests: ${finalReport.tests} | Review: ${finalReport.review}${state.pullRequestUrl ? ` | PR: ${state.pullRequestUrl}` : ''}`,
        timestamp: Date.now(),
      });

      // Persist final completed state
      await this.persistWorkflow(state);

      // Remove from active polling map
      this.activeWorkflows.delete(state.sessionId);
      this.activeWorkflows.delete(state.workflowId);

      console.log(`[WorkflowOrchestrator] Workflow ${state.workflowId} (Session: ${state.sessionId}) successfully COMPLETED.`);
      return state;
    } catch (err: any) {
      console.error(`[WorkflowOrchestrator] Downstream pipeline error for ${state.sessionId}:`, err?.message || err);
      state.error = err?.message || 'Downstream processing failed.';
      state.stage = 'FAILED';
      state.executionStatus = 'FAILED';
      state.downstreamExecuting = false;
      state.downstreamExecuted = true; // Mark true so downstream is not re-attempted automatically
      await this.persistWorkflow(state);
      this.activeWorkflows.delete(state.sessionId);
      this.activeWorkflows.delete(state.workflowId);
      return state;
    }
  }

  /**
   * Handle Jules task failure
   */
  public async handleJulesFailed(state: WorkflowState, liveSession: any, errorMsg: string): Promise<WorkflowState> {
    console.error(`[WorkflowOrchestrator] Jules session ${state.sessionId} FAILED: ${errorMsg}. Halting workflow and skipping Git/PR.`);

    state.status = 'FAILED';
    state.stage = 'FAILED';
    state.executionStatus = 'FAILED';
    state.error = errorMsg;
    state.summary = `Google Jules task failed: ${errorMsg}`;
    state.updatedAt = new Date().toISOString();

    state.steps.push({
      id: `step_err_${Date.now()}`,
      phase: 2,
      phaseName: 'Implementation (Jules)',
      agent: 'developer',
      thought: `Google Jules execution failed: ${errorMsg}`,
      toolCalls: [
        {
          id: `tc_jules_err_${Date.now()}`,
          name: 'jules_session_error',
          args: { sessionId: state.sessionId, error: errorMsg },
          result: `FAILED: ${errorMsg}`,
          timestamp: Date.now(),
        },
      ],
      status: 'STATUS: FAILED',
      output: `Error running Google Jules agent: ${errorMsg}`,
      timestamp: Date.now(),
    });

    const finalReport: FinalReport = {
      implementation: 'FAIL',
      tests: 'SKIPPED',
      review: 'SKIPPED',
      filesChanged: [],
      testSummary: 'Tests skipped: Google Jules coding agent failed.',
      reviewSummary: 'Review skipped: Google Jules coding agent failed.',
      remainingIssues: [errorMsg],
      totalCycles: { testerCorrections: 0, reviewerCorrections: 0 },
      metrics: {
        durationMs: Date.now() - new Date(state.createdAt).getTime(),
        modelUsed: state.options.model || 'gemini-3.7-flash',
        codingAgentUsed: state.agentId,
        error: errorMsg,
      },
    };
    state.finalReport = finalReport;

    await this.persistWorkflow(state);
    this.activeWorkflows.delete(state.sessionId);
    this.activeWorkflows.delete(state.workflowId);

    return state;
  }

  /**
   * Handle Jules task cancellation
   */
  public async handleJulesCancelled(state: WorkflowState, liveSession: any): Promise<WorkflowState> {
    console.log(`[WorkflowOrchestrator] Jules session ${state.sessionId} CANCELLED.`);

    state.status = 'CANCELLED';
    state.stage = 'CANCELLED';
    state.executionStatus = 'CANCELLED';
    state.summary = 'Google Jules task was cancelled.';
    state.updatedAt = new Date().toISOString();

    state.steps.push({
      id: `step_cancel_${Date.now()}`,
      phase: 2,
      phaseName: 'Implementation (Jules)',
      agent: 'developer',
      thought: 'Google Jules session was cancelled.',
      status: 'STATUS: CANCELLED',
      output: 'Session cancelled.',
      timestamp: Date.now(),
    });

    await this.persistWorkflow(state);
    this.activeWorkflows.delete(state.sessionId);
    this.activeWorkflows.delete(state.workflowId);

    return state;
  }

  /**
   * Server restart recovery:
   * Scans SessionStore for all non-terminal sessions and automatically resumes their orchestration.
   */
  public async resumeAllActiveWorkflows(): Promise<WorkflowState[]> {
    console.log('[WorkflowOrchestrator] Scanning durable store for active workflows across server reboot...');
    
    let activeSessions: StoredCodingSession[] = [];
    if (this.sessionStore.listActiveWorkflows) {
      activeSessions = await this.sessionStore.listActiveWorkflows();
    } else {
      const all = await this.sessionStore.listSessions();
      activeSessions = all.filter((s) => !isTerminalState(s.status));
    }

    console.log(`[WorkflowOrchestrator] Discovered ${activeSessions.length} active sessions to resume.`);
    const resumedStates: WorkflowState[] = [];

    for (const session of activeSessions) {
      try {
        const state = await this.resumeWorkflow(session.sessionId);
        if (state) {
          resumedStates.push(state);
        }
      } catch (err: any) {
        console.error(`[WorkflowOrchestrator] Failed to resume session ${session.sessionId}:`, err.message);
      }
    }

    return resumedStates;
  }

  /**
   * Background polling worker loop
   */
  public ensurePollerRunning(): void {
    if (this.pollerTimer || this.activeWorkflows.size === 0) {
      return;
    }

    this.pollerTimer = setInterval(async () => {
      if (this.isPollingActive) return;
      this.isPollingActive = true;

      try {
        const sessionsToPoll = Array.from(new Set(Array.from(this.activeWorkflows.values()).map((s) => s.sessionId)));
        if (sessionsToPoll.length === 0) {
          this.stopBackgroundPoller();
          return;
        }

        for (const sessionId of sessionsToPoll) {
          try {
            await this.pollWorkflow(sessionId);
          } catch (err: any) {
            console.warn(`[WorkflowOrchestrator] Poller error on ${sessionId}:`, err.message);
          }
        }
      } finally {
        this.isPollingActive = false;
      }
    }, this.pollIntervalMs);

    if (this.pollerTimer && typeof this.pollerTimer.unref === 'function') {
      this.pollerTimer.unref();
    }
  }

  public stopBackgroundPoller(): void {
    if (this.pollerTimer) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = null;
    }
  }

  public async getWorkflow(id: string): Promise<WorkflowState | null> {
    const cleanId = id.replace(/^sessions\//, '').replace(/^wf_/, '');
    const inMem = this.activeWorkflows.get(cleanId) || this.activeWorkflows.get(`wf_${cleanId}`) || this.activeWorkflows.get(id);
    if (inMem) return inMem;

    const stored = await this.sessionStore.getSession(cleanId) || await this.sessionStore.getSession(id);
    return stored?.workflowState || null;
  }

  /**
   * Helper to persist workflow state changes to SessionStore
   */
  private async persistWorkflow(state: WorkflowState): Promise<void> {
    if (this.sessionStore.saveWorkflowState) {
      await this.sessionStore.saveWorkflowState(state.sessionId, state).catch((err) => {
        console.warn('[WorkflowOrchestrator] Failed to save workflow state to store:', err.message);
      });
    } else {
      await this.sessionStore.updateSession(state.sessionId, {
        status: state.status,
        prUrl: state.prUrl,
        gitBranch: state.gitBranch,
        error: state.error,
        summary: state.summary,
        workflowState: state,
        updatedAt: new Date().toISOString(),
      }).catch((err) => {
        console.warn('[WorkflowOrchestrator] Failed to update session in store:', err.message);
      });
    }
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();

export const performDeterministicReview = (
  paramsOrTestResult: any,
  gitDiffArg?: string,
  filesChangedArg?: string[]
): DeterministicReviewResult => {
  return workflowOrchestrator.performDeterministicReview(paramsOrTestResult, gitDiffArg, filesChangedArg);
};
