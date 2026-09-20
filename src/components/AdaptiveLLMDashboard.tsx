import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  Gauge,
  ShieldAlert,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Layers,
  Search,
  Filter,
  TrendingUp,
  Cpu,
  Workflow,
  HelpCircle,
} from 'lucide-react';
import { errorManager } from '../managers/errorManager';

export interface ModelMetadata {
  modelId: string;
  providerId: string;
  displayName: string;
  version?: string;
  availability: boolean;
  costTier?: string;
  contextWindow?: number;
  status: 'MEASURED' | 'UNMEASURED' | 'LOW_CONFIDENCE' | 'UNAVAILABLE';
  evaluationHistoryCount: number;
  lastEvaluatedAt?: number;
}

export interface ModelRankingStats {
  modelId: string;
  providerId: string;
  modelVersion?: string;
  category: string;
  complexity?: string;
  sampleCount: number;
  meanScore: number;
  successRate: number;
  meanLatencyMs: number;
  meanCost: number;
  confidence: number;
  uncertaintyPenalty: number;
  compositeRankScore: number;
  lastEvaluatedAt: number;
  status: 'MEASURED' | 'UNMEASURED' | 'LOW_CONFIDENCE' | 'UNAVAILABLE';
}

export function AdaptiveLLMDashboard() {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [rankings, setRankings] = useState<Record<string, { rankedModels: ModelRankingStats[]; unmeasuredModels: string[]; totalSamples: number }>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('CODE_GENERATION');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);

  // Selector Inspection State
  const [inspectorPrompt, setInspectorPrompt] = useState<string>(
    'Optimize the PostgreSQL connection pool in src/db.ts, prevent SQL injection vulnerabilities, and implement pure functions without external libraries.'
  );
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionDecision, setSelectionDecision] = useState<any | null>(null);

  const fetchAdaptiveData = async () => {
    setIsLoading(true);
    try {
      const [modelsRes, rankingsRes] = await Promise.all([
        fetch('/api/llm/models').then((r) => r.json()),
        fetch('/api/llm/rankings').then((r) => r.json()),
      ]);

      if (modelsRes.success) {
        setModels(modelsRes.models || []);
      }
      if (rankingsRes.success) {
        setRankings(rankingsRes.rankings || {});
      }
    } catch (err: any) {
      errorManager.parseError(err, 'Failed to load adaptive LLM data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdaptiveData();
  }, []);

  const handleRunHermeticBenchmark = async () => {
    setIsRunningBenchmark(true);
    setBenchmarkResult(null);
    try {
      const res = await fetch('/api/llm/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, isLive: false }),
      });
      const data = await res.json();
      setBenchmarkResult(data);
      await fetchAdaptiveData();
    } catch (err: any) {
      errorManager.parseError(err, 'Benchmark run error');
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleInspectRouting = async () => {
    if (!inspectorPrompt.trim()) return;
    setIsSelecting(true);
    try {
      const res = await fetch('/api/llm/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inspectorPrompt }),
      });
      const data = await res.json();
      setSelectionDecision(data);
    } catch (err: any) {
      errorManager.parseError(err, 'Problem routing inspection error');
    } finally {
      setIsSelecting(false);
    }
  };

  const currentCategoryData = rankings[selectedCategory] || { rankedModels: [], unmeasuredModels: [], totalSamples: 0 };

  const CATEGORIES = [
    { id: 'CODE_GENERATION', label: 'Code Generation' },
    { id: 'CODE_DEBUGGING', label: 'Debugging' },
    { id: 'REFACTORING', label: 'Refactoring' },
    { id: 'TEST_GENERATION', label: 'Testing' },
    { id: 'SECURITY', label: 'Security Audit' },
    { id: 'ARCHITECTURE', label: 'Architecture' },
    { id: 'REASONING', label: 'Reasoning' },
    { id: 'MATHEMATICS', label: 'Mathematics' },
  ];

  return (
    <div id="adaptive-llm-dashboard" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-800">Adaptive Multi-LLM Empirical Routing</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Self-Learning Engine
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Learns empirically which LLM produces measured, verified results per problem category, complexity, and constraints.
              Eliminates subjective hardcoding using objective evaluations and Bayesian uncertainty bounds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="refresh-adaptive-data-btn"
              onClick={fetchAdaptiveData}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Refresh Registry
            </button>
            <button
              id="run-hermetic-bench-btn"
              onClick={handleRunHermeticBenchmark}
              disabled={isRunningBenchmark}
              className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {isRunningBenchmark ? 'Running Hermetic Benchmark...' : 'Run Objective Benchmark'}
            </button>
          </div>
        </div>
      </div>

      {/* Model Registry Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Discovered Models</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{models.length}</div>
          <div className="text-xs text-slate-500 mt-1">Across all registered providers</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Measured & Proven</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {models.filter((m) => m.status === 'MEASURED').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">High statistical confidence</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unmeasured / Learning</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {models.filter((m) => m.status === 'UNMEASURED' || m.status === 'LOW_CONFIDENCE').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Subject to exploration quota</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Evaluations</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            {Object.values(rankings).reduce((acc, curr) => acc + curr.totalSamples, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Objective verifiable runs</div>
        </div>
      </div>

      {/* Main Grid: Category Empirical Rankings & Model Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Category Empirical Ranking Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-indigo-600" />
                Empirical Performance Rankings
              </h3>
              <p className="text-xs text-slate-500">Sorted by Bayesian Upper-Confidence Bound (Score - Uncertainty)</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ranking Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3 text-right">Composite Score</th>
                  <th className="py-2.5 px-3 text-right">Success Rate</th>
                  <th className="py-2.5 px-3 text-right">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Mean Latency</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentCategoryData.rankedModels.length > 0 ? (
                  currentCategoryData.rankedModels.map((stat, idx) => (
                    <tr key={stat.modelId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-700">#{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {stat.modelId}
                        {stat.modelVersion && (
                          <span className="ml-1 text-[10px] text-slate-400">({stat.modelVersion})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 uppercase font-mono text-[11px]">{stat.providerId}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                        {(stat.compositeRankScore * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">
                        {(stat.successRate * 100).toFixed(0)}% ({stat.sampleCount} runs)
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        {(stat.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">{stat.meanLatencyMs.toFixed(0)}ms</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            stat.status === 'MEASURED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : stat.status === 'LOW_CONFIDENCE'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {stat.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No verified benchmark evaluations recorded for category {selectedCategory} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {currentCategoryData.unmeasuredModels.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                Unmeasured Models ({currentCategoryData.unmeasuredModels.length}):{' '}
                <span className="font-mono text-slate-700">{currentCategoryData.unmeasuredModels.join(', ')}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right 1 Col: Dynamic Models in Registry */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Dynamic Model Registry
            </h3>
            <p className="text-xs text-slate-500">Auto-discovered models & availability status</p>
          </div>

          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {models.map((m) => (
              <div
                key={m.modelId}
                className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-colors flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-semibold text-xs text-slate-800">{m.displayName || m.modelId}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <span className="uppercase font-mono">{m.providerId}</span>
                    <span>•</span>
                    <span className="capitalize">{m.costTier || 'flash'} tier</span>
                    {m.evaluationHistoryCount > 0 && (
                      <>
                        <span>•</span>
                        <span>{m.evaluationHistoryCount} evals</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                      m.status === 'MEASURED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : m.status === 'UNMEASURED'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : m.status === 'LOW_CONFIDENCE'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section: Intelligent Task Decomposition & Routing Inspector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-indigo-600" />
              Adaptive Problem Classifier & Routing Inspector
            </h3>
            <p className="text-xs text-slate-500">
              Decomposes complex problems into specialized sub-phases and selects empirically best models.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <input
            id="inspector-prompt-input"
            type="text"
            value={inspectorPrompt}
            onChange={(e) => setInspectorPrompt(e.target.value)}
            placeholder="Enter any task prompt or requirements to analyze..."
            className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <button
            id="inspect-routing-btn"
            onClick={handleInspectRouting}
            disabled={isSelecting || !inspectorPrompt.trim()}
            className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isSelecting ? 'Analyzing...' : 'Analyze & Route'}
          </button>
        </div>

        {/* Inspection Result Display */}
        {selectionDecision && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Primary Category</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  {selectionDecision.classifiedProblem?.category}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Subcategory: {selectionDecision.classifiedProblem?.subcategory || 'General'}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Complexity & Strategy</div>
                <div className="text-sm font-bold text-indigo-700 mt-0.5">
                  {selectionDecision.classifiedProblem?.complexity} • {selectionDecision.decisionType}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Confidence: {(selectionDecision.confidence * 100).toFixed(0)}%
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Selected Primary Model</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">
                  {selectionDecision.selectedModelId}
                </div>
                <div className="text-xs text-slate-500 mt-1 uppercase font-mono">
                  Provider: {selectionDecision.selectedProviderId}
                </div>
              </div>
            </div>

            {/* Extracted Constraints */}
            {selectionDecision.classifiedProblem?.constraints?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-600">Extracted Constraints:</span>
                {selectionDecision.classifiedProblem.constraints.map((c: string) => (
                  <span
                    key={c}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-200 text-slate-700 rounded-md"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Selection Reasoning */}
            <div className="text-xs text-slate-700 bg-indigo-50/50 border border-indigo-100 p-3 rounded-lg">
              <span className="font-semibold text-indigo-900">Selection Decision Reason:</span>{' '}
              {selectionDecision.reason}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
