import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  Gauge,
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
  Loader2,
  RefreshCw,
  Check,
} from 'lucide-react';
import { errorManager } from '../managers/errorManager';
import { ActionableErrorCard } from './ActionableErrorCard';

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
  const [rankings, setRankings] = useState<
    Record<string, { rankedModels: ModelRankingStats[]; unmeasuredModels: string[]; totalSamples: number }>
  >({});
  const [selectedCategory, setSelectedCategory] = useState<string>('CODE_GENERATION');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  // Selector Inspection State
  const [inspectorPrompt, setInspectorPrompt] = useState<string>(
    'Optimize the PostgreSQL connection pool in src/db.ts, prevent SQL injection vulnerabilities, and implement pure functions without external libraries.'
  );
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionDecision, setSelectionDecision] = useState<any | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const fetchAdaptiveData = async () => {
    setIsLoading(true);
    setBenchmarkError(null);
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
    setBenchmarkError(null);
    try {
      const res = await fetch('/api/llm/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, isLive: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erreur lors du benchmark empirique');
      }
      setBenchmarkResult(data);
      await fetchAdaptiveData();
    } catch (err: any) {
      setBenchmarkError(err.message || 'Benchmark run error');
      errorManager.parseError(err, 'Benchmark run error');
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleInspectRouting = async () => {
    if (!inspectorPrompt.trim()) return;
    setIsSelecting(true);
    setSelectionError(null);
    try {
      const res = await fetch('/api/llm/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inspectorPrompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erreur lors de l’analyse de routing');
      }
      setSelectionDecision(data);
    } catch (err: any) {
      setSelectionError(err.message || 'Problem routing inspection error');
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
      {/* Header Banner - Unified Dark Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                    Adaptive Multi-LLM Empirical Routing
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 font-mono">
                    Self-Learning Engine
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
                  Routage autonome et dynamique basé sur les performances réelles mesurées par catégorie de problème,
                  complexité et contraintes strictes.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
            <button
              id="refresh-adaptive-data-btn"
              type="button"
              onClick={fetchAdaptiveData}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
              Actualiser
            </button>

            <button
              id="run-hermetic-bench-btn"
              type="button"
              onClick={handleRunHermeticBenchmark}
              disabled={isRunningBenchmark}
              className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRunningBenchmark ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Benchmark en cours...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Lancer Benchmark Objectif
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Benchmark Error or Success Notification */}
      {benchmarkError && (
        <ActionableErrorCard
          title="Erreur lors de l'exécution du benchmark objectif"
          error={benchmarkError}
          onRetry={handleRunHermeticBenchmark}
        />
      )}

      {benchmarkResult && (
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <strong className="block text-emerald-300 font-bold">Benchmark hermétique complété avec succès</strong>
              <span className="text-slate-400">
                Run ID: <code className="font-mono text-slate-300">{benchmarkResult.runId}</code> ·{' '}
                {benchmarkResult.evaluations?.length || 0} évaluations intégrées en mémoire empirique.
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-400/90 bg-slate-950 px-2.5 py-1 rounded border border-emerald-500/20">
            Coût : ${(benchmarkResult.totalCost || 0).toFixed(6)}
          </span>
        </div>
      )}

      {/* 4 Stat Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Modèles découverts</span>
          <div className="text-2xl font-bold text-slate-100 mt-1 font-mono">{models.length}</div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Catalogués multi-providers</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mesurés & Prouvés</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {models.filter((m) => m.status === 'MEASURED').length}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Haute confiance statistique</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">En apprentissage</span>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">
            {models.filter((m) => m.status === 'UNMEASURED' || m.status === 'LOW_CONFIDENCE').length}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Exploration adaptative</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Évaluations</span>
          <div className="text-2xl font-bold text-violet-400 mt-1 font-mono">
            {Object.values(rankings).reduce((acc, curr) => acc + curr.totalSamples, 0)}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Observations vérifiées</span>
        </div>
      </div>

      {/* Main Grid: Category Rankings & Models Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Category Empirical Ranking Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wider">
                <Gauge className="w-4 h-4 text-violet-400" />
                Classement empirique par catégorie
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculé selon la borne d'incertitude bayésienne (Score moyen pondéré)
              </p>
            </div>

            {/* Filter Category Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/80'
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
                <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/70 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Rang</th>
                  <th className="py-2.5 px-3">Modèle</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3 text-right">Composite Rank</th>
                  <th className="py-2.5 px-3 text-right">Succès</th>
                  <th className="py-2.5 px-3 text-right">Confiance</th>
                  <th className="py-2.5 px-3 text-right">Latence moy.</th>
                  <th className="py-2.5 px-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentCategoryData.rankedModels.length > 0 ? (
                  currentCategoryData.rankedModels.map((stat, idx) => (
                    <tr key={stat.modelId} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-300 font-mono">#{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-100">
                        {stat.modelId}
                        {stat.modelVersion && (
                          <span className="ml-1 text-[10px] text-slate-500 font-mono">({stat.modelVersion})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 uppercase font-mono text-[11px]">{stat.providerId}</td>
                      <td className="py-2.5 px-3 text-right font-bold font-mono text-violet-400">
                        {(stat.compositeRankScore * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-mono">
                        {(stat.successRate * 100).toFixed(0)}% <span className="text-slate-500 text-[10px]">({stat.sampleCount} runs)</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 font-mono">
                        {(stat.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 font-mono">{stat.meanLatencyMs.toFixed(0)}ms</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border font-mono ${
                            stat.status === 'MEASURED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : stat.status === 'LOW_CONFIDENCE'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {stat.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Aucune évaluation vérifiée enregistrée pour la catégorie {selectedCategory} pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {currentCategoryData.unmeasuredModels.length > 0 && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5 truncate">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                Modèles non mesurés ({currentCategoryData.unmeasuredModels.length}) :{' '}
                <span className="font-mono text-slate-300 truncate">{currentCategoryData.unmeasuredModels.join(', ')}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right 1 Col: Dynamic Models in Registry */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3.5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wider">
              <Cpu className="w-4 h-4 text-violet-400" />
              Registre dynamique des modèles
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Disponibilité et métadonnées en temps réel</p>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {models.map((m) => (
              <div
                key={m.modelId}
                className="p-3 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl transition-all flex items-center justify-between gap-2"
              >
                <div className="truncate">
                  <div className="font-semibold text-xs text-slate-200 truncate">{m.displayName || m.modelId}</div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="uppercase font-mono text-[10px] text-blue-400">{m.providerId}</span>
                    <span>·</span>
                    <span className="capitalize">{m.costTier || 'flash'}</span>
                    {m.evaluationHistoryCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{m.evaluationHistoryCount} evals</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border font-mono ${
                      m.status === 'MEASURED'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : m.status === 'UNMEASURED'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : m.status === 'LOW_CONFIDENCE'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wider">
            <Workflow className="w-4 h-4 text-violet-400" />
            Classifieur & Inspecteur de Routage Adaptatif
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Testez l'analyse du classifieur et observez la décision de routage sélectionnée pour n'importe quel besoin logiciel.
          </p>
        </div>

        {selectionError && (
          <ActionableErrorCard
            title="Erreur lors de l'inspection de routage"
            error={selectionError}
            onRetry={handleInspectRouting}
          />
        )}

        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <input
            id="inspector-prompt-input"
            type="text"
            value={inspectorPrompt}
            onChange={(e) => setInspectorPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSelecting) {
                handleInspectRouting();
              }
            }}
            placeholder="Saisissez une consigne ou un problème logiciel à analyser..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-all font-sans"
          />
          <button
            id="inspect-routing-btn"
            type="button"
            onClick={handleInspectRouting}
            disabled={isSelecting || !inspectorPrompt.trim()}
            className="px-5 py-2.5 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isSelecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Analyser & Router
              </>
            )}
          </button>
        </div>

        {/* Inspection Result Display */}
        {selectionDecision && (
          <div className="mt-4 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Catégorie Détectée
                </span>
                <div className="text-sm font-bold text-slate-100">
                  {selectionDecision.classifiedProblem?.category}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Sous-catégorie : {selectionDecision.classifiedProblem?.subcategory || 'General'}
                </div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Complexité & Décision
                </span>
                <div className="text-sm font-bold text-violet-400">
                  {selectionDecision.classifiedProblem?.complexity} • {selectionDecision.decisionType}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Confiance : {(selectionDecision.confidence * 100).toFixed(0)}%
                </div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Modèle Sélectionné
                </span>
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {selectionDecision.selectedModelId}
                </div>
                <div className="text-xs text-slate-400 mt-1 uppercase font-mono">
                  Provider : {selectionDecision.selectedProviderId}
                </div>
              </div>
            </div>

            {/* Extracted Constraints */}
            {selectionDecision.classifiedProblem?.constraints?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300">
                <span className="font-semibold text-slate-400">Contraintes extraites :</span>
                {selectionDecision.classifiedProblem.constraints.map((c: string) => (
                  <span
                    key={c}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300 rounded-md font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Selection Reasoning */}
            <div className="text-xs text-slate-300 bg-violet-500/10 border border-violet-500/20 p-3 rounded-lg leading-relaxed">
              <strong className="text-violet-300">Raisonnement de sélection :</strong> {selectionDecision.reason}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
