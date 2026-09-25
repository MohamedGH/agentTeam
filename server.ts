import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { providerManager } from './server/providerManager';
import { quotaManager } from './server/quotaManager';
import { workspace } from './server/virtualWorkspace';
import { agentTeamEngine } from './server/agentTeam';
import { codingAgentManager } from './server/codingAgents';
import { workflowOrchestrator } from './server/workflowOrchestrator';
import { cloudMonitoringQuotaService } from './server/cloudMonitoring';
import { githubManager, evaluateQualityGate } from './server/github';
import { selfImprovementEngine, improvementMemory } from './server/selfImprovement';
import { createLLMRoutes } from './server/llmRoutes';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
  app.use(express.json());

  // AGENTTEAM_API_KEY protection middleware for mutation endpoints
  const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requiredApiKey = process.env.AGENTTEAM_API_KEY;
    if (!requiredApiKey) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          error: 'Forbidden: AGENTTEAM_API_KEY must be configured in production environment',
        });
      }
      return next();
    }
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    const queryKey = (req.query?.apiKey || req.query?.api_key || req.query?.token) as string | undefined;
    const token = apiKeyHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader) || queryKey;
    if (token !== requiredApiKey) {
      return res.status(401).json({
        error: 'Unauthorized: Valid AGENTTEAM_API_KEY is required for mutation endpoints',
      });
    }
    next();
  };

  // Health & Monitoring status
  app.get('/api/health', async (req, res) => {
    try {
      const health = await providerManager.getHealthStatus();
      res.json({
        status: 'ok',
        server: 'agentTeam-server',
        hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
        hasJulesApiKey: Boolean(process.env.JULES_API_KEY),
        hasGitHubToken: githubManager.isConfigured(),
        ...health,
      });
    } catch (err: any) {
      res.json({
        status: 'ok',
        server: 'agentTeam-server',
        hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
        hasJulesApiKey: Boolean(process.env.JULES_API_KEY),
        hasGitHubToken: githubManager.isConfigured(),
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    }
  });

  // Unified Quota Status API (Google Cloud Monitoring + Service Usage + Quota Manager)
  app.get('/api/quota/status', async (req, res) => {
    try {
      const tier = (req.query.tier as string) || 'tier_3';
      const forceRefresh = req.query.refresh === 'true';
      const result = await providerManager.getAllQuotaStatus(tier, forceRefresh);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dedicated Google Cloud Monitoring Telemetry API
  app.get('/api/monitoring/telemetry', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const result = await cloudMonitoringQuotaService.fetchRealQuotaMetrics(forceRefresh);
      const cacheStatus = cloudMonitoringQuotaService.getCacheStatus();
      res.json({
        ...result,
        cacheStatus,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quota/select-model', requireApiKey, async (req, res) => {
    try {
      const { preferredModels, tier = 'tier_3', estimatedTokens = 1000 } = req.body;
      const models = preferredModels || ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'];
      const selected = await providerManager.selectOptimalModel(models, tier, estimatedTokens);
      res.json({
        selectedModel: selected,
        tier,
        estimatedTokens,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quota/record-usage', requireApiKey, (req, res) => {
    try {
      const { model, usageMetadata } = req.body;
      if (!model) {
        return res.status(400).json({ error: 'Model name is required' });
      }
      providerManager.recordModelUsage(model, usageMetadata || {});
      res.json({ success: true, model });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quota/reset-state', requireApiKey, (req, res) => {
    try {
      const { model } = req.body;
      quotaManager.resetState(model);
      cloudMonitoringQuotaService.invalidateCache();
      res.json({ success: true, message: model ? `Reset quota for ${model}` : 'Reset all model quotas' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quota/simulate-cooldown', requireApiKey, (req, res) => {
    try {
      const { model = 'gemini-3.7-flash', durationSeconds = 30 } = req.body;
      quotaManager.handle429Error(model, durationSeconds);
      res.json({
        success: true,
        model,
        durationSeconds,
        message: `Simulated 429 rate limit cooldown on ${model} for ${durationSeconds}s. Failover routing is now active.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Virtual Workspace APIs
  app.get('/api/workspace/files', (req, res) => {
    try {
      const files = workspace.getFiles();
      const status = workspace.gitStatus();
      const diff = workspace.gitDiff();
      res.json({
        files,
        gitStatus: status,
        gitDiff: diff,
        totalFiles: Object.keys(files).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workspace/file', requireApiKey, (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'File path and content are required' });
      }
      workspace.setFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/workspace/file', requireApiKey, (req, res) => {
    try {
      const { path: filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }
      workspace.deleteFile(filePath);
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workspace/run-command', requireApiKey, (req, res) => {
    try {
      const { command = 'pytest' } = req.body;
      const output = workspace.runCommand(command);
      res.json({
        success: true,
        command,
        output,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workspace/reset', requireApiKey, (req, res) => {
    try {
      workspace.seedDefaultFiles();
      res.json({
        success: true,
        files: workspace.getFiles(),
        message: 'Workspace reset to default baseline',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Multi-Provider Management APIs
  app.get('/api/providers/list', (req, res) => {
    try {
      const list = providerManager.getProvidersList();
      const activeProvider = providerManager.getActiveProvider();
      res.json({
        activeProvider,
        providers: list,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/providers/select', requireApiKey, (req, res) => {
    try {
      const { provider, model } = req.body;
      if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
      }
      providerManager.setActiveProvider(provider, model);
      res.json({
        success: true,
        activeProvider: providerManager.getActiveProvider(),
        model: model || 'default',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Adaptive Multi-LLM Routing & Empirical Benchmarking APIs
  app.use('/api/llm', createLLMRoutes(requireApiKey));

  // -------------------------------------------------------------
  // AUTONOMOUS CODING AGENT APIS (Google Jules)
  // Kept architecturally separate from LLM ProviderManager
  // -------------------------------------------------------------
  app.get('/api/coding-agents/list', (req, res) => {
    try {
      const agents = codingAgentManager.listAgents();
      res.json({
        agents,
        total: agents.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/coding-agents/sources', async (req, res) => {
    try {
      const agentId = (req.query.agent as string) || 'jules';
      const sources = await codingAgentManager.listSources(agentId);
      res.json({
        agent: agentId,
        sources,
        total: sources.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/coding-agents/execute', requireApiKey, async (req, res) => {
    try {
      const {
        workflowId,
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTOMATION_MODE_UNSPECIFIED',
        requirePlanApproval = false,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      } = req.body;

      const taskPrompt = task || prompt;
      const repoTarget = repositoryName || repository;
      if (!repoTarget || !taskPrompt) {
        return res.status(400).json({ error: 'Repository and task are required' });
      }

      const gitRequested = Boolean(
        git?.push ||
        git?.commit ||
        git?.createPullRequest ||
        commitAndPush ||
        commitPushAndCreatePR ||
        createRepository
      );

      if (gitRequested && !githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const workflow = await workflowOrchestrator.startWorkflow({
        workflowId,
        agent,
        repository: repoTarget,
        branch,
        taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      });

      res.status(200).json({
        success: true,
        workflowId: workflow.workflowId,
        sessionId: workflow.sessionId,
        executionStatus: workflow.executionStatus,
        status: workflow.status,
        stage: workflow.stage,
        repository: repoTarget,
        branch,
        title: workflow.title || title,
        prompt: taskPrompt,
        prUrl: workflow.prUrl,
        gitBranch: workflow.gitBranch,
        workflow,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Asynchronous Observable Jules & Coding Agent Endpoints

  // 1. Start new Jules session (routed through WorkflowOrchestrator)
  app.post('/api/coding-agents/jules/sessions', requireApiKey, async (req, res) => {
    try {
      const {
        workflowId,
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTOMATION_MODE_UNSPECIFIED',
        requirePlanApproval = false,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      } = req.body;

      const taskPrompt = task || prompt;
      const repoTarget = repositoryName || repository;
      if (!repoTarget || !taskPrompt) {
        return res.status(400).json({
          error: 'Repository and task prompt are required to start a Jules session',
        });
      }

      const gitRequested = Boolean(
        git?.commit ||
        git?.push ||
        git?.createPullRequest ||
        commitAndPush ||
        commitPushAndCreatePR ||
        createRepository
      );

      // Enforce strict GitHub authentication requirement
      if (gitRequested && !githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const workflow = await workflowOrchestrator.startWorkflow({
        workflowId,
        agent,
        repository: repoTarget,
        branch,
        taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      });

      res.status(201).json({
        success: true,
        workflowId: workflow.workflowId,
        sessionId: workflow.sessionId,
        status: workflow.status,
        stage: workflow.stage,
        executionStatus: workflow.executionStatus,
        workflow,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all stored historical sessions
  app.get('/api/coding-agents/sessions/history', async (req, res) => {
    try {
      const agentId = req.query.agent as string | undefined;
      const sessions = await codingAgentManager.listStoredSessions(agentId);
      res.json({ success: true, sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generic start session endpoint alias (routed through WorkflowOrchestrator)
  app.post('/api/coding-agents/sessions', requireApiKey, async (req, res) => {
    try {
      const {
        workflowId,
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTO_CREATE_PR',
        requirePlanApproval = false,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      } = req.body;

      const taskPrompt = task || prompt;
      const repoTarget = repositoryName || repository;
      if (!repoTarget || !taskPrompt) {
        return res.status(400).json({
          error: 'Repository and task prompt are required',
        });
      }

      const gitRequested = Boolean(
        git?.commit ||
        git?.push ||
        git?.createPullRequest ||
        commitAndPush ||
        commitPushAndCreatePR ||
        createRepository
      );

      if (gitRequested && !githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const workflow = await workflowOrchestrator.startWorkflow({
        workflowId,
        agent,
        repository: repoTarget,
        branch,
        taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
      });

      res.status(201).json({
        success: true,
        workflowId: workflow.workflowId,
        sessionId: workflow.sessionId,
        status: workflow.status,
        stage: workflow.stage,
        executionStatus: workflow.executionStatus,
        workflow,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get Jules session status and details (supports lookup by sessionId or workflowId)
  app.get('/api/coding-agents/jules/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const wf = await workflowOrchestrator.getWorkflow(sessionId);
      const actualSessionId = wf?.sessionId || sessionId;
      const session = await codingAgentManager.getSession(actualSessionId, 'jules');

      res.json({
        success: true,
        workflowId: wf?.workflowId,
        sessionId: session.id,
        status: wf?.status || session.state,
        stage: wf?.stage,
        prUrl: wf?.prUrl || session.prUrl,
        gitBranch: wf?.gitBranch || session.gitBranch,
        summary: wf?.summary || session.resultSummary,
        workflow: wf || undefined,
        session,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get Jules session activities (supports incremental ?lastActivityTime=...)
  app.get('/api/coding-agents/jules/sessions/:sessionId/activities', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const lastActivityTime = req.query.lastActivityTime as string | undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const activities = await codingAgentManager.listActivities(sessionId, 'jules', {
        lastActivityTime,
        pageSize,
      });
      res.json({
        success: true,
        sessionId,
        activities,
        total: activities.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Send interactive message/prompt to Jules session
  app.post('/api/coding-agents/jules/sessions/:sessionId/message', requireApiKey, async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId);
      const message = req.body?.message || req.body?.prompt;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message content is required' });
      }

      await codingAgentManager.sendMessage(sessionId, message, 'jules');
      res.json({
        success: true,
        sessionId,
        message,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Approve plan for Jules session
  app.post('/api/coding-agents/jules/sessions/:sessionId/approve-plan', requireApiKey, async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId);
      await codingAgentManager.approvePlan(sessionId, 'jules');
      res.json({
        success: true,
        sessionId,
        status: 'PLAN_APPROVED',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/coding-agents/session/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const agent = (req.query.agent as string) || 'jules';
      const wf = await workflowOrchestrator.getWorkflow(id);
      const actualSessionId = wf?.sessionId || id;
      const session = await codingAgentManager.getSession(actualSessionId, agent);
      res.json({
        ...session,
        workflowId: wf?.workflowId,
        workflowState: wf || session.workflowState,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/coding-agents/session/:id/activities', async (req, res) => {
    try {
      const id = req.params.id;
      const agent = (req.query.agent as string) || 'jules';
      const wf = await workflowOrchestrator.getWorkflow(id);
      const actualSessionId = wf?.sessionId || id;
      const lastActivityTime = req.query.lastActivityTime as string | undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const activities = await codingAgentManager.listActivities(actualSessionId, agent, {
        lastActivityTime,
        pageSize,
      });
      res.json({ sessionId: actualSessionId, activities });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // WORKFLOW ORCHESTRATOR APIS
  // -------------------------------------------------------------
  app.post('/api/workflows', requireApiKey, async (req, res) => {
    try {
      const {
        workflowId,
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTOMATION_MODE_UNSPECIFIED',
        git,
        commitAndPush,
        commitPushAndCreatePR,
        createRepository,
        testCommand,
        workingDirectory,
      } = req.body;

      const taskPrompt = task || prompt;
      if (!repository || !taskPrompt) {
        return res.status(400).json({ error: 'repository and task prompt are required' });
      }

      const workflow = await workflowOrchestrator.startWorkflow({
        workflowId,
        agent,
        repository,
        branch,
        taskPrompt,
        title,
        automationMode,
        git,
        commitAndPush,
        commitPushAndCreatePR,
        createRepository,
        testCommand,
        workingDirectory,
      });

      res.status(201).json({
        success: true,
        workflowId: workflow.workflowId,
        sessionId: workflow.sessionId,
        status: workflow.status,
        stage: workflow.stage,
        executionStatus: workflow.executionStatus,
        workflow,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workflows', async (req, res) => {
    try {
      const active = workflowOrchestrator.getActiveWorkflows();
      const allStored = await codingAgentManager.listStoredSessions();
      const workflows = allStored
        .filter((s) => s.workflowState)
        .map((s) => s.workflowState);

      res.json({
        success: true,
        activeWorkflowsCount: active.length,
        active,
        workflows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workflows/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const workflow = await workflowOrchestrator.getWorkflow(id);
      if (!workflow) {
        return res.status(404).json({ error: `Workflow "${id}" not found` });
      }
      res.json({ success: true, workflow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workflows/:id/poll', requireApiKey, async (req, res) => {
    try {
      const id = String(req.params.id);
      const workflow = await workflowOrchestrator.pollWorkflow(id);
      res.json({ success: true, workflow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workflows/:id/resume', requireApiKey, async (req, res) => {
    try {
      const id = String(req.params.id);
      const workflow = await workflowOrchestrator.resumeWorkflow(id);
      if (!workflow) {
        return res.status(404).json({ error: `Workflow "${id}" not found` });
      }
      res.json({ success: true, workflow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // SELF-IMPROVEMENT ENGINE APIS & SSE STREAM
  // -------------------------------------------------------------
  app.get('/api/self-improvement/status', (req, res) => {
    try {
      const current = selfImprovementEngine.getCurrentCycle();
      const all = selfImprovementEngine.getAllCycles();
      res.json({
        success: true,
        isRunning: Boolean(current),
        currentCycle: current,
        totalCycles: all.length,
        lastCompleted: all.find((c) => c.status === 'COMPLETED' || c.status === 'ROLLED_BACK'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/self-improvement/history', (req, res) => {
    try {
      const cycles = selfImprovementEngine.getAllCycles();
      res.json({
        success: true,
        cycles,
        total: cycles.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/self-improvement/cycles/:cycleId', (req, res) => {
    try {
      const cycleId = String(req.params.cycleId);
      const cycle = selfImprovementEngine.getCycle(cycleId);
      if (!cycle) {
        return res.status(404).json({ error: `Cycle "${cycleId}" not found` });
      }
      res.json({ success: true, cycle });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/self-improvement/run', requireApiKey, async (req, res) => {
    try {
      const options = req.body || {};
      const cycle = await selfImprovementEngine.runCycle(options);
      res.status(200).json({
        success: true,
        cycleId: cycle.id,
        status: cycle.status,
        phase: cycle.currentPhase,
        cycle,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/self-improvement/rollback/:cycleId', requireApiKey, async (req, res) => {
    try {
      const cycleId = String(req.params.cycleId);
      const workingDirectory = req.body?.workingDirectory;
      const success = await selfImprovementEngine.rollbackCycle(cycleId, workingDirectory);
      if (!success) {
        return res.status(400).json({
          success: false,
          error: `Unable to rollback cycle "${cycleId}". Backup not found or already reverted.`,
        });
      }
      res.json({ success: true, cycleId, rolledBack: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/self-improvement/config', (req, res) => {
    try {
      const config = selfImprovementEngine.getConfig();
      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/self-improvement/memory', (req, res) => {
    try {
      const records = improvementMemory.getAllRecords();
      const successful = improvementMemory.findSuccessfulImprovements();
      const failed = improvementMemory.findFailedImprovements();
      res.json({
        success: true,
        total: records.length,
        successfulCount: successful.length,
        failedCount: failed.length,
        records,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/self-improvement/memory', requireApiKey, (req, res) => {
    try {
      improvementMemory.clearMemory();
      res.json({ success: true, message: 'Improvement memory cleared.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/self-improvement/reset-failures', requireApiKey, (req, res) => {
    try {
      selfImprovementEngine.resetFailureCount();
      res.json({ success: true, message: 'Consecutive failure counter reset.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/self-improvement/stream', requireApiKey, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial status
    sendEvent({
      type: 'INIT',
      current: selfImprovementEngine.getCurrentCycle(),
      totalCycles: selfImprovementEngine.getAllCycles().length,
    });

    const unsubscribe = selfImprovementEngine.subscribe((event) => {
      sendEvent({ type: 'CYCLE_EVENT', ...event });
    });

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  // -------------------------------------------------------------
  // GITHUB DIRECT WORKFLOW & REPOSITORY APIS
  // -------------------------------------------------------------
  app.get('/api/github/status', async (req, res) => {
    try {
      const configured = githubManager.isConfigured();
      if (!configured) {
        return res.json({
          configured: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }
      try {
        const user = await githubManager.getClient().getAuthenticatedUser();
        return res.json({
          configured: true,
          user: {
            login: user.login,
            id: user.id,
            avatar_url: user.avatar_url,
            html_url: user.html_url,
          },
        });
      } catch (clientErr: any) {
        return res.json({
          configured: true,
          user: null,
          warning: clientErr.message,
        });
      }
    } catch (err: any) {
      res.status(500).json({ configured: false, error: err.message });
    }
  });

  app.post('/api/github/config', async (req, res) => {
    try {
      const { token, owner } = req.body;
      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Token is required' });
      }

      githubManager.configureToken(token.trim(), owner ? String(owner).trim() : undefined);
      process.env.GITHUB_TOKEN = token.trim();
      if (owner) {
        process.env.GITHUB_OWNER = String(owner).trim();
      }

      // Verify token with GitHub API
      try {
        const user = await githubManager.getClient().getAuthenticatedUser();
        return res.json({
          success: true,
          user: {
            login: user.login,
            id: user.id,
            avatar_url: user.avatar_url,
            html_url: user.html_url,
          },
        });
      } catch (authErr: any) {
        return res.status(401).json({
          success: false,
          error: `GitHub authentication failed: ${authErr.message}`,
        });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/github/push-main', async (req, res) => {
    try {
      const token = (req.body.token || process.env.GITHUB_TOKEN || githubManager.getClient().getToken() || '').trim();
      const repository = (req.body.repository || 'MohamedGH/agentTeam').trim();
      const branch = (req.body.branch || 'main').trim();
      const [owner, repo] = repository.split('/');

      if (!token) {
        return res.status(400).json({ success: false, error: 'GitHub Token required for push' });
      }
      if (!owner || !repo) {
        return res.status(400).json({ success: false, error: 'Invalid repository format (expected owner/repo)' });
      }

      // Ensure token configured
      githubManager.configureToken(token, owner);
      process.env.GITHUB_TOKEN = token;

      const gitOps = githubManager.getGitOps();
      const pushResult = await gitOps.pushBranch({
        branch,
        owner,
        repo,
        token,
        cwd: process.cwd(),
      });

      // Query latest CI run if available
      let ciRun: any = null;
      try {
        const client = githubManager.getClient();
        const runsRes = await client.request<any>(`/repos/${owner}/${repo}/actions/runs?per_page=3`);
        if (runsRes && runsRes.workflow_runs && runsRes.workflow_runs.length > 0) {
          ciRun = runsRes.workflow_runs[0];
        }
      } catch (ciErr) {
        console.warn('[Server] Could not immediately fetch workflow runs:', ciErr);
      }

      return res.json({
        success: true,
        push: pushResult,
        ciRun,
      });
    } catch (err: any) {
      console.error('[Server] Push failed:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/github/ci-runs', async (req, res) => {
    try {
      const repository = ((req.query.repository as string) || 'MohamedGH/agentTeam').trim();
      const [owner, repo] = repository.split('/');
      const client = githubManager.getClient();
      if (!client.isConfigured()) {
        return res.status(401).json({ success: false, error: 'GitHub client not configured' });
      }

      const runsRes = await client.request<any>(`/repos/${owner}/${repo}/actions/runs?per_page=5`);
      const runs = runsRes?.workflow_runs || [];

      // If specific run ID requested, get its jobs too
      let jobs: any[] = [];
      const runId = req.query.runId ? String(req.query.runId) : (runs[0]?.id ? String(runs[0].id) : null);
      if (runId) {
        try {
          const jobsRes = await client.request<any>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
          jobs = jobsRes?.jobs || [];
        } catch (jobErr) {
          console.warn('[Server] Could not fetch run jobs:', jobErr);
        }
      }

      return res.json({
        success: true,
        runs,
        selectedRunId: runId,
        jobs,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/github/workflow', requireApiKey, async (req, res) => {
    try {
      if (!githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      // Check Quality Gate before executing any Git mutations
      const shouldCommit = Boolean(req.body.git?.commit || req.body.commitAndPush || req.body.commitPushAndCreatePR);
      const shouldPush = Boolean(req.body.git?.push || req.body.commitAndPush || req.body.commitPushAndCreatePR);
      const shouldCreatePR = Boolean(req.body.git?.createPullRequest || req.body.commitPushAndCreatePR);
      const shouldCreateRepo = Boolean(req.body.createRepository);
      if (shouldCommit || shouldPush || shouldCreatePR || shouldCreateRepo) {
        const gateCheck = evaluateQualityGate({
          sessionStatus: req.body.sessionStatus,
          executionStatus: req.body.executionStatus,
          realExecution: req.body.realExecution,
          testsPassed: req.body.testsPassed,
          reviewExecuted: req.body.reviewExecuted,
          reviewApproved: req.body.reviewApproved,
        });

        if (!gateCheck.authorized) {
          return res.status(403).json({
            success: false,
            error: gateCheck.reason,
            testsPassed: req.body.testsPassed === true,
            gateAuthorized: false,
          });
        }
      }

      const result = await workflowOrchestrator.executeDelivery(req.body);
      return res.status(result.success ? 200 : (result.testsPassed === false ? 422 : 500)).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/github/repositories', requireApiKey, async (req, res) => {
    try {
      if (!githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const { repository, createRepository = true, private: isPrivate = false } = req.body;
      if (createRepository) {
        const gateCheck = evaluateQualityGate({
          sessionStatus: req.body.sessionStatus,
          executionStatus: req.body.executionStatus,
          realExecution: req.body.realExecution,
          testsPassed: req.body.testsPassed,
          reviewExecuted: req.body.reviewExecuted,
          reviewApproved: req.body.reviewApproved,
        });

        if (!gateCheck.authorized) {
          return res.status(403).json({
            success: false,
            error: gateCheck.reason,
            testsPassed: req.body.testsPassed === true,
            gateAuthorized: false,
          });
        }
      }

      const repo = await githubManager.ensureRepository({
        repository,
        createRepository,
        private: isPrivate,
        sessionStatus: req.body.sessionStatus,
        executionStatus: req.body.executionStatus,
        realExecution: req.body.realExecution,
        testsPassed: req.body.testsPassed,
        reviewExecuted: req.body.reviewExecuted,
        reviewApproved: req.body.reviewApproved,
      });

      res.json({ success: true, repository: repo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Multi-Agent Team Execution API (with single-source WorkflowOrchestrator delegation when codingAgent is set)
  app.post('/api/team/run', requireApiKey, async (req, res) => {
    try {
      const {
        prompt,
        tier = 'tier_3',
        provider,
        model,
        codingAgent,
        repository,
        branch,
        automationMode,
        title,
        createRepository,
        repositoryName,
        private: isPrivate,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
        git,
      } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Task prompt is required' });
      }

      if (codingAgent === 'jules' || codingAgent === 'mock') {
        const repoTarget = repositoryName || repository || 'MohamedGH/agentTeam';
        const workflow = await workflowOrchestrator.startWorkflow({
          agent: codingAgent,
          repository: repoTarget,
          branch: branch || 'main',
          taskPrompt: prompt,
          title,
          automationMode,
          createRepository,
          repositoryName,
          private: isPrivate,
          git,
          commitAndPush,
          commitPushAndCreatePR,
          testCommand,
          workingDirectory,
          tier,
          model,
          provider,
        });
        return res.json({
          success: workflow.status === 'COMPLETED',
          executionStatus: workflow.executionStatus,
          taskId: workflow.workflowId,
          sessionId: workflow.sessionId,
          workflowId: workflow.workflowId,
          stage: workflow.stage,
          status: workflow.status,
          prUrl: workflow.prUrl,
          gitBranch: workflow.gitBranch,
          commitSha: workflow.commitSha,
          commitUrl: workflow.commitUrl,
          pullRequestUrl: workflow.pullRequestUrl,
          testsPassed: workflow.testsPassed,
          steps: workflow.steps,
          finalReport: workflow.finalReport,
          workflow,
        });
      }

      const result = await agentTeamEngine.runWorkflow(prompt, tier, undefined, {
        provider,
        model,
        codingAgent,
        repository,
        branch,
        automationMode,
        title,
        createRepository,
        repositoryName,
        private: isPrivate,
        commitAndPush,
        commitPushAndCreatePR,
        testCommand,
        workingDirectory,
        realExecution: req.body.realExecution,
        git,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server-Sent Events (SSE) Stream for real-time live execution (supports both GET and POST)
  const handleStreamRequest = async (req: express.Request, res: express.Response) => {
    const prompt = (req.body?.prompt || req.query?.prompt || 'Refactor math utilities and add tests') as string;
    const tier = (req.body?.tier || req.query?.tier || 'tier_3') as string;
    const provider = (req.body?.provider || req.query?.provider) as string | undefined;
    const model = (req.body?.model || req.query?.model) as string | undefined;
    const codingAgent = (req.body?.codingAgent || req.query?.codingAgent) as any;
    const repository = (req.body?.repository || req.query?.repository) as string | undefined;
    const branch = (req.body?.branch || req.query?.branch) as string | undefined;
    const automationMode = (req.body?.automationMode || req.query?.automationMode) as any;
    const title = (req.body?.title || req.query?.title) as string | undefined;
    const createRepository = req.body?.createRepository ?? (req.query?.createRepository === 'true');
    const repositoryName = (req.body?.repositoryName || req.query?.repositoryName) as string | undefined;
    const isPrivate = req.body?.private ?? (req.query?.private === 'true');
    const commitAndPush = req.body?.commitAndPush ?? (req.query?.commitAndPush === 'true');
    const commitPushAndCreatePR = req.body?.commitPushAndCreatePR ?? (req.query?.commitPushAndCreatePR === 'true');
    const testCommand = (req.body?.testCommand || req.query?.testCommand) as string | undefined;
    const workingDirectory = (req.body?.workingDirectory || req.query?.workingDirectory) as string | undefined;
    const git = req.body?.git;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      if (codingAgent === 'jules' || codingAgent === 'mock') {
        const repoTarget = repositoryName || repository || 'MohamedGH/agentTeam';
        const workflow = await workflowOrchestrator.startWorkflow({
          agent: codingAgent,
          repository: repoTarget,
          branch: branch || 'main',
          taskPrompt: prompt,
          title,
          automationMode,
          createRepository,
          repositoryName,
          private: isPrivate,
          git,
          commitAndPush,
          commitPushAndCreatePR,
          testCommand,
          workingDirectory,
          tier,
          model,
          provider,
        });

        // Emit initial steps to SSE stream
        if (Array.isArray(workflow.steps)) {
          for (const step of workflow.steps) {
            res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
          }
        }

        const streamResult = {
          success: workflow.status === 'COMPLETED',
          executionStatus: workflow.executionStatus,
          taskId: workflow.workflowId,
          sessionId: workflow.sessionId,
          workflowId: workflow.workflowId,
          stage: workflow.stage,
          status: workflow.status,
          prUrl: workflow.prUrl,
          gitBranch: workflow.gitBranch,
          commitSha: workflow.commitSha,
          commitUrl: workflow.commitUrl,
          pullRequestUrl: workflow.pullRequestUrl,
          testsPassed: workflow.testsPassed,
          steps: workflow.steps,
          finalReport: workflow.finalReport,
          workflow,
        };

        res.write(`data: ${JSON.stringify({ type: 'complete', result: streamResult })}\n\n`);
        return res.end();
      }

      const result = await agentTeamEngine.runWorkflow(
        prompt,
        tier,
        (step) => {
          res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
        },
        {
          provider,
          model,
          codingAgent,
          repository,
          branch,
          automationMode,
          title,
          createRepository,
          repositoryName,
          private: isPrivate,
          commitAndPush,
          commitPushAndCreatePR,
          testCommand,
          workingDirectory,
          realExecution: req.body?.realExecution ?? (req.query?.realExecution === 'true'),
          git,
        }
      );

      res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  };

  app.get('/api/team/run-stream', requireApiKey, handleStreamRequest);
  app.post('/api/team/run-stream', requireApiKey, handleStreamRequest);

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Resume all non-terminal workflows persisted across server reboot
  try {
    const resumed = await workflowOrchestrator.resumeAllActiveWorkflows();
    console.log(`[agentTeam] Resumed ${resumed.length} active workflows from durable store.`);
    workflowOrchestrator.ensurePollerRunning();
  } catch (err: any) {
    console.warn('[agentTeam] Non-fatal error resuming active workflows:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[agentTeam] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
