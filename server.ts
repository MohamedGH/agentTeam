import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { providerManager } from './server/providerManager';
import { quotaManager } from './server/quotaManager';
import { workspace } from './server/virtualWorkspace';
import { agentTeamEngine } from './server/agentTeam';
import { cloudMonitoringQuotaService } from './server/cloudMonitoring';

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
        ...health,
      });
    } catch (err: any) {
      res.json({
        status: 'ok',
        server: 'agentTeam-server',
        hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
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

  // Multi-Agent Team Execution API
  app.post('/api/team/run', async (req, res) => {
    try {
      const { prompt, tier = 'tier_3', provider, model } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Task prompt is required' });
      }

      const result = await agentTeamEngine.runWorkflow(prompt, tier, undefined, { provider, model });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server-Sent Events (SSE) Stream for real-time live execution
  app.get('/api/team/run-stream', async (req, res) => {
    const prompt = (req.query.prompt as string) || 'Refactor math utilities and add tests';
    const tier = (req.query.tier as string) || 'tier_3';
    const provider = req.query.provider as string | undefined;
    const model = req.query.model as string | undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const result = await agentTeamEngine.runWorkflow(prompt, tier, (step) => {
        res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
      }, { provider, model });

      res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  });

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
