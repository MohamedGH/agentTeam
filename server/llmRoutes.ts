import { Router, Request, Response, RequestHandler } from 'express';
import crypto from 'crypto';
import { problemClassifier } from './llm/ProblemClassifier';
import { llmRegistry } from './llm/LLMRegistry';
import { llmRankingEngine } from './llm/LLMRankingEngine';
import { llmSelector } from './llm/LLMSelector';
import { llmBenchmarkEngine } from './llm/LLMBenchmarkEngine';
import { llmPerformanceMemory } from './llm/LLMPerformanceMemory';
import { llmSelfImprovementAdapter } from './selfImprovement/LLMSelfImprovementAdapter';
import { ProblemCategory, ProblemComplexity } from './llm/types';
import { sanitizeGitOutput } from './github/githubGitOperations';

function sendSafeError(res: Response, err: any, status: number = 500, fallback: string = 'Internal server error') {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const raw = err?.message || String(err || '');
  console.error(`[LLMRoutes Error ${requestId}] (${status}):`, sanitizeGitOutput(raw), err?.stack ? sanitizeGitOutput(err.stack) : '');
  res.status(status).json({
    success: false,
    error: fallback,
    requestId,
  });
}

export function createLLMRoutes(authMiddleware?: RequestHandler): Router {
  const router = Router();
  const requireAuth = authMiddleware || ((_req: Request, _res: Response, next: () => void) => next());

  // =========================================================================
  // PUBLIC INSPECTION & DISCOVERY ENDPOINTS (Used by UI Dashboard)
  // Read-only discovery and stateless classification/routing simulation.
  // =========================================================================

  // 1. Classify a problem (Public stateless classifier)
  router.post('/classify', (req: Request, res: Response) => {
    try {
      const taskPrompt = req.body?.taskPrompt || req.body?.prompt;
      const context = req.body?.context;
      if (!taskPrompt || typeof taskPrompt !== 'string' || taskPrompt.trim().length === 0) {
        return res.status(400).json({ error: 'taskPrompt is required and must be a non-empty string' });
      }
      if (taskPrompt.length > 50_000) {
        return res.status(400).json({ error: 'taskPrompt exceeds maximum allowed length (50000 chars)' });
      }
      const classified = problemClassifier.classify(taskPrompt, context);
      res.json({ success: true, classified });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Classification failed');
    }
  });

  // 2. Discover available models and empirical status (Public)
  router.get('/models', (_req: Request, res: Response) => {
    try {
      const models = llmRegistry.discoverModels();
      res.json({ success: true, count: models.length, models });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to retrieve models');
    }
  });

  // 3. Get empirical rankings (Public)
  router.get('/rankings', (req: Request, res: Response) => {
    try {
      const category = typeof req.query.category === 'string' ? (req.query.category as ProblemCategory) : undefined;
      const complexity = typeof req.query.complexity === 'string' ? (req.query.complexity as ProblemComplexity) : undefined;

      if (category && category.length > 64) {
        return res.status(400).json({ error: 'Invalid category parameter' });
      }
      if (complexity && complexity.length > 64) {
        return res.status(400).json({ error: 'Invalid complexity parameter' });
      }

      if (category) {
        const ranking = llmRankingEngine.getRankings(category, complexity);
        return res.json({ success: true, ranking });
      }

      const allRankings = llmRankingEngine.getAllRankings();
      res.json({ success: true, rankings: allRankings });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to retrieve rankings');
    }
  });

  // 4. Select model for a task using adaptive routing (Public Simulation/Inspection)
  router.post('/select', (req: Request, res: Response) => {
    try {
      const taskPrompt = req.body?.taskPrompt || req.body?.prompt;
      const { context, constraints } = req.body || {};
      if (!taskPrompt || typeof taskPrompt !== 'string' || taskPrompt.trim().length === 0) {
        return res.status(400).json({ error: 'taskPrompt is required and must be a non-empty string' });
      }
      if (taskPrompt.length > 50_000) {
        return res.status(400).json({ error: 'taskPrompt exceeds maximum allowed length (50000 chars)' });
      }
      const decision = llmSelector.selectModelForTask(taskPrompt, context, constraints);
      res.json({ success: true, decision });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Model selection failed');
    }
  });

  // 4b. Get latest real operational routing decision (Public read-only summary for dashboard)
  router.get('/last-operational-decision', (_req: Request, res: Response) => {
    try {
      const decision = llmSelector.getLastOperationalDecision();
      res.json({ success: true, decision });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to get operational decision');
    }
  });

  // =========================================================================
  // PROTECTED MUTATION & SENSITIVE INTERNAL ENDPOINTS (requireAuth)
  // Endpoints that execute live test suites, mutate memory, inspect internal memory, or execute system adaptations.
  // =========================================================================

  // 5. Decompose complex task into specialized roles (PROTECTED)
  router.post('/decompose-and-select', requireAuth, (req: Request, res: Response) => {
    try {
      const taskPrompt = req.body?.taskPrompt || req.body?.prompt;
      const { context } = req.body || {};
      if (!taskPrompt || typeof taskPrompt !== 'string' || taskPrompt.trim().length === 0) {
        return res.status(400).json({ error: 'taskPrompt is required and must be a non-empty string' });
      }
      if (taskPrompt.length > 50_000) {
        return res.status(400).json({ error: 'taskPrompt exceeds maximum allowed length (50000 chars)' });
      }
      const roles = llmSelector.decomposeAndSelect(taskPrompt, context);
      res.json({ success: true, roles });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Decomposition failed');
    }
  });

  // 6. Run controlled benchmark suite (MUTATION - Protected)
  router.post('/benchmark/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const { categories, benchmarkIds, candidateModels, isLive, maxRequestsBudget, maxCostBudget } = req.body || {};
      const result = await llmBenchmarkEngine.runBenchmarks({
        categories,
        benchmarkIds,
        candidateModels,
        isLive: Boolean(isLive),
        maxRequestsBudget: typeof maxRequestsBudget === 'number' ? maxRequestsBudget : undefined,
        maxCostBudget: typeof maxCostBudget === 'number' ? maxCostBudget : undefined,
      });
      res.json({ success: true, result });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Benchmark run failed');
    }
  });

  // 7. Empirical memory stats & evaluations (SENSITIVE READ - Protected)
  router.get('/memory/stats', requireAuth, (_req: Request, res: Response) => {
    try {
      const stats = llmPerformanceMemory.getAllStats();
      const evaluations = llmPerformanceMemory.getEvaluations();
      res.json({
        success: true,
        totalEvaluations: evaluations.length,
        stats,
      });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to retrieve stats');
    }
  });

  // 8. Clear empirical memory (MUTATION - Protected)
  router.post('/memory/clear', requireAuth, (_req: Request, res: Response) => {
    try {
      llmPerformanceMemory.clear();
      res.json({ success: true, message: 'LLM performance memory cleared.' });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to clear memory');
    }
  });

  // 9. Self-Improvement anomalies detection (SENSITIVE READ - Protected)
  router.get('/self-improvement/anomalies', requireAuth, (_req: Request, res: Response) => {
    try {
      const anomalies = llmSelfImprovementAdapter.detectAnomalies();
      res.json({ success: true, count: anomalies.length, anomalies });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to detect anomalies');
    }
  });

  // 10. Execute self-improvement adaptation cycle (MUTATION - Protected)
  router.post('/self-improvement/adaptations/run', requireAuth, async (_req: Request, res: Response) => {
    try {
      const anomalies = llmSelfImprovementAdapter.detectAnomalies();
      const plans = llmSelfImprovementAdapter.planAdaptations(anomalies);
      const records = [];

      for (const plan of plans) {
        const record = await llmSelfImprovementAdapter.applyAdaptation(plan);
        await llmSelfImprovementAdapter.verifyAdaptation(record.id);
        records.push(record);
      }

      res.json({
        success: true,
        anomaliesDetected: anomalies.length,
        adaptationsExecuted: records.length,
        records,
      });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Adaptation run failed');
    }
  });

  // 11. Self-Improvement history (SENSITIVE READ - Protected)
  router.get('/self-improvement/history', requireAuth, (_req: Request, res: Response) => {
    try {
      const history = llmSelfImprovementAdapter.getHistory();
      res.json({ success: true, count: history.length, history });
    } catch (err: any) {
      sendSafeError(res, err, 500, 'Failed to get history');
    }
  });

  return router;
}
