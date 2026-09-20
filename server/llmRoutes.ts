import { Router, Request, Response } from 'express';
import { problemClassifier } from './llm/ProblemClassifier';
import { llmRegistry } from './llm/LLMRegistry';
import { llmRankingEngine } from './llm/LLMRankingEngine';
import { llmSelector } from './llm/LLMSelector';
import { llmBenchmarkEngine } from './llm/LLMBenchmarkEngine';
import { llmPerformanceMemory } from './llm/LLMPerformanceMemory';
import { llmSelfImprovementAdapter } from './llm/LLMSelfImprovementAdapter';
import { ProblemCategory, ProblemComplexity } from './llm/types';

export function createLLMRoutes(): Router {
  const router = Router();

  // 1. Classify a problem
  router.post('/classify', (req: Request, res: Response) => {
    try {
      const { taskPrompt, context } = req.body;
      if (!taskPrompt || typeof taskPrompt !== 'string') {
        return res.status(400).json({ error: 'taskPrompt is required and must be a string' });
      }
      const classified = problemClassifier.classify(taskPrompt, context);
      res.json({ success: true, classified });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Classification failed' });
    }
  });

  // 2. Discover available models and empirical status
  router.get('/models', (req: Request, res: Response) => {
    try {
      const models = llmRegistry.discoverModels();
      res.json({ success: true, count: models.length, models });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve models' });
    }
  });

  // 3. Get empirical rankings
  router.get('/rankings', (req: Request, res: Response) => {
    try {
      const category = req.query.category as ProblemCategory | undefined;
      const complexity = req.query.complexity as ProblemComplexity | undefined;

      if (category) {
        const ranking = llmRankingEngine.getRankings(category, complexity);
        return res.json({ success: true, ranking });
      }

      const allRankings = llmRankingEngine.getAllRankings();
      res.json({ success: true, rankings: allRankings });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve rankings' });
    }
  });

  // 4. Select model for a task using adaptive routing
  router.post('/select', (req: Request, res: Response) => {
    try {
      const { taskPrompt, context, constraints } = req.body;
      if (!taskPrompt) {
        return res.status(400).json({ error: 'taskPrompt is required' });
      }
      const decision = llmSelector.selectModelForTask(taskPrompt, context, constraints);
      res.json({ success: true, decision });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Model selection failed' });
    }
  });

  // 5. Decompose complex task into specialized roles
  router.post('/decompose-and-select', (req: Request, res: Response) => {
    try {
      const { taskPrompt, context } = req.body;
      if (!taskPrompt) {
        return res.status(400).json({ error: 'taskPrompt is required' });
      }
      const roles = llmSelector.decomposeAndSelect(taskPrompt, context);
      res.json({ success: true, roles });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Decomposition failed' });
    }
  });

  // 6. Run controlled benchmark suite
  router.post('/benchmark/run', async (req: Request, res: Response) => {
    try {
      const { categories, benchmarkIds, candidateModels, isLive, maxRequestsBudget, maxCostBudget } = req.body;
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
      res.status(500).json({ error: err.message || 'Benchmark run failed' });
    }
  });

  // 7. Empirical memory stats & evaluations
  router.get('/memory/stats', (req: Request, res: Response) => {
    try {
      const stats = llmPerformanceMemory.getAllStats();
      const evaluations = llmPerformanceMemory.getEvaluations();
      res.json({
        success: true,
        totalEvaluations: evaluations.length,
        stats,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve stats' });
    }
  });

  // 8. Clear empirical memory
  router.post('/memory/clear', (req: Request, res: Response) => {
    try {
      llmPerformanceMemory.clear();
      res.json({ success: true, message: 'LLM performance memory cleared.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear memory' });
    }
  });

  // 9. Self-Improvement diagnostic audit
  router.get('/health', (req: Request, res: Response) => {
    try {
      const health = llmSelfImprovementAdapter.inspectLLMPerformance();
      res.json({ success: true, health });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to inspect health' });
    }
  });

  return router;
}
