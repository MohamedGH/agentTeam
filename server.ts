import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { providerManager } from './server/providerManager';
import { quotaManager } from './server/quotaManager';
import { workspace } from './server/virtualWorkspace';
import { agentTeamEngine } from './server/agentTeam';
import { codingAgentManager } from './server/codingAgents';
import { cloudMonitoringQuotaService } from './server/cloudMonitoring';
import { githubManager } from './server/github';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

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

  app.post('/api/quota/select-model', async (req, res) => {
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

  app.post('/api/quota/record-usage', (req, res) => {
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

  app.post('/api/quota/reset-state', (req, res) => {
    try {
      const { model } = req.body;
      quotaManager.resetState(model);
      cloudMonitoringQuotaService.invalidateCache();
      res.json({ success: true, message: model ? `Reset quota for ${model}` : 'Reset all model quotas' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/quota/simulate-cooldown', (req, res) => {
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

  app.post('/api/workspace/file', (req, res) => {
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

  app.delete('/api/workspace/file', (req, res) => {
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

  app.post('/api/workspace/run-command', (req, res) => {
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

  app.post('/api/workspace/reset', (req, res) => {
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

  app.post('/api/providers/select', (req, res) => {
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

  app.post('/api/coding-agents/execute', async (req, res) => {
    try {
      const {
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTO_CREATE_PR',
        requirePlanApproval = false,
        waitForCompletion = false,
        timeoutSeconds,
        createRepository,
        repositoryName,
        private: isPrivate,
        git,
        commitAndPush,
        commitPushAndCreatePR,
      } = req.body;

      const taskPrompt = task || prompt;
      const repoTarget = repositoryName || repository;
      if (!repoTarget || !taskPrompt) {
        return res.status(400).json({ error: 'Repository and task are required' });
      }

      const gitRequested = Boolean(
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

      // If client requests execution with git operations or synchronous waiting
      if (gitRequested || (waitForCompletion && timeoutSeconds && timeoutSeconds > 0)) {
        const result = await codingAgentManager.execute({
          agent,
          repository: repoTarget,
          branch,
          task: taskPrompt,
          title,
          automationMode,
          requirePlanApproval,
          timeoutSeconds,
          createRepository,
          repositoryName,
          private: isPrivate,
          git,
          commitAndPush,
          commitPushAndCreatePR,
        });

        if (!result.success && result.error === 'GITHUB_TOKEN is not configured') {
          return res.status(401).json({
            success: false,
            error: 'GITHUB_TOKEN is not configured',
          });
        }

        return res.status(result.success ? 200 : 500).json(result);
      }

      // Default asynchronous flow: startSession immediately returns sessionId and status
      const session = await codingAgentManager.startSession({
        agent,
        repository: repoTarget,
        branch,
        task: taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
      });

      res.status(200).json({
        success: true,
        sessionId: session.id,
        status: session.state || 'QUEUED',
        repository: repoTarget,
        branch,
        title: session.title || title,
        prompt: taskPrompt,
        prUrl: session.prUrl,
        gitBranch: session.gitBranch,
        session,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Asynchronous Observable Jules & Coding Agent Endpoints

  // 1. Start new Jules session (supports immediate asynchronous dispatch or integrated git push workflow)
  app.post('/api/coding-agents/jules/sessions', async (req, res) => {
    try {
      const {
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

      // If Git workflow is requested (commit, push, PR, createRepository), execute the task and git workflow
      if (gitRequested) {
        const result = await codingAgentManager.execute({
          agent,
          repository: repoTarget,
          branch,
          task: taskPrompt,
          title,
          automationMode,
          requirePlanApproval,
          createRepository,
          repositoryName,
          private: isPrivate,
          git,
          commitAndPush,
          commitPushAndCreatePR,
        });

        if (!result.success && result.error === 'GITHUB_TOKEN is not configured') {
          return res.status(401).json({
            success: false,
            error: 'GITHUB_TOKEN is not configured',
          });
        }

        return res.status(result.success ? 200 : (result.testsPassed === false ? 422 : 500)).json({
          success: result.success,
          sessionId: result.sessionId,
          status: result.status,
          error: result.error,
          testsPassed: result.testsPassed,
          git: result.git || {
            committed: Boolean(result.commitSha),
            pushed: Boolean(result.commitUrl),
            branch: result.gitBranch || branch,
            commitSha: result.commitSha,
            commitUrl: result.commitUrl,
            pullRequestUrl: result.pullRequestUrl || result.prUrl,
          },
        });
      }

      const session = await codingAgentManager.startSession({
        agent,
        repository: repoTarget,
        branch,
        task: taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
      });

      res.status(201).json({
        success: true,
        sessionId: session.id,
        session,
        status: session.state,
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

  // Generic start session endpoint alias
  app.post('/api/coding-agents/sessions', async (req, res) => {
    try {
      const {
        agent = 'jules',
        repository,
        branch = 'main',
        task,
        prompt,
        title,
        automationMode = 'AUTO_CREATE_PR',
        requirePlanApproval = false,
      } = req.body;

      const taskPrompt = task || prompt;
      if (!repository || !taskPrompt) {
        return res.status(400).json({
          error: 'Repository and task prompt are required',
        });
      }

      const session = await codingAgentManager.startSession({
        agent,
        repository,
        branch,
        task: taskPrompt,
        title,
        automationMode,
        requirePlanApproval,
      });

      res.status(201).json({
        success: true,
        sessionId: session.id,
        session,
        status: session.state,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get Jules session status and details
  app.get('/api/coding-agents/jules/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await codingAgentManager.getSession(sessionId, 'jules');
      res.json({
        success: true,
        sessionId: session.id,
        status: session.state,
        prUrl: session.prUrl,
        gitBranch: session.gitBranch,
        summary: session.resultSummary,
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
  app.post('/api/coding-agents/jules/sessions/:sessionId/message', async (req, res) => {
    try {
      const { sessionId } = req.params;
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
  app.post('/api/coding-agents/jules/sessions/:sessionId/approve-plan', async (req, res) => {
    try {
      const { sessionId } = req.params;
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
      const sessionId = req.params.id;
      const agent = (req.query.agent as string) || 'jules';
      const session = await codingAgentManager.getSession(sessionId, agent);
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/coding-agents/session/:id/activities', async (req, res) => {
    try {
      const sessionId = req.params.id;
      const agent = (req.query.agent as string) || 'jules';
      const lastActivityTime = req.query.lastActivityTime as string | undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const activities = await codingAgentManager.listActivities(sessionId, agent, {
        lastActivityTime,
        pageSize,
      });
      res.json({ sessionId, activities });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

  app.post('/api/github/workflow', async (req, res) => {
    try {
      if (!githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const result = await githubManager.processTaskResult(req.body);
      return res.status(result.success ? 200 : (result.testsPassed === false ? 422 : 500)).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/github/repositories', async (req, res) => {
    try {
      if (!githubManager.isConfigured()) {
        return res.status(401).json({
          success: false,
          error: 'GITHUB_TOKEN is not configured',
        });
      }

      const { repository, createRepository = true, private: isPrivate = false } = req.body;
      const repo = await githubManager.ensureRepository({
        repository,
        createRepository,
        private: isPrivate,
      });

      res.json({ success: true, repository: repo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Multi-Agent Team Execution API (with optional Jules delegation)
  app.post('/api/team/run', async (req, res) => {
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
        git,
      } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Task prompt is required' });
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
    const git = req.body?.git;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
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

  app.get('/api/team/run-stream', handleStreamRequest);
  app.post('/api/team/run-stream', handleStreamRequest);

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[agentTeam] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
