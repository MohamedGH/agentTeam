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
  ShieldCheck,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import { errorManager } from '../managers/errorManager';
import { ActionableErrorCard } from './ActionableErrorCard';
import { apiFetch } from '../utils/apiFetch';

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

  // Selector Inspection State & Current Operational Routing
  const [inspectorPrompt, setInspectorPrompt] = useState<string>(
    'Optimize the PostgreSQL connection pool in src/db.ts, prevent SQL injection vulnerabilities, and implement pure functions without external libraries.'
  );
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [inspectionDecision, setInspectionDecision] = useState<any | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [operationalDecision, setOperationalDecision] = useState<any | null>(null);
  const [isLoadingOperational, setIsLoadingOperational] = useState<boolean>(true);

  const fetchAdaptiveData = async () => {
    setIsLoading(true);
    setBenchmarkError(null);
    try {
      const [modelsRes, rankingsRes] = await Promise.all([
        apiFetch('/api/llm/models').then((r) => r.json()),
        apiFetch('/api/llm/rankings').then((r) => r.json()),
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

  const fetchOperationalDecision = async () => {
    setIsLoadingOperational(true);
    try {
      const res = await apiFetch('/api/llm/last-operational-decision');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.decision) {
          setOperationalDecision(data.decision);
        }
      }
    } catch (err) {
      console.warn('[AdaptiveLLMDashboard] Could not fetch operational decision:', err);
    } finally {
      setIsLoadingOperational(false);
    }
  };

  const handleInspectRouting = async (promptToRoute?: string) => {
    const targetPrompt = (promptToRoute || inspectorPrompt).trim();
    if (!targetPrompt) return;
    setIsSelecting(true);
    setSelectionError(null);
    try {
      const res = await apiFetch('/api/llm/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: targetPrompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erreur lors de l’analyse de routing');
      }
      setInspectionDecision(data.decision || data);
    } catch (err: any) {
      setSelectionError(err.message || 'Problem routing inspection error');
      errorManager.parseError(err, 'Problem routing inspection error');
    } finally {
      setIsSelecting(false);
    }
  };

  useEffect(() => {
    fetchAdaptiveData();
    fetchOperationalDecision();
  }, []);

  const handleRunHermeticBenchmark = async () => {
    setIsRunningBenchmark(true);
    setBenchmarkResult(null);
    setBenchmarkError(null);
    try {
      const res = await apiFetch('/api/llm/benchmark/run', {
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
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  Adaptive Multi-LLM Empirical Routing
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 font-mono">
                  Moteur Auto-Apprenant
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
                Routage autonome et dynamique basé sur les performances réelles mesurées, isolation stricte des sources
                et vérification fail-closed de l'identité des modèles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
            <button
              id="refresh-adaptive-data-btn"
              type="button"
              onClick={fetchAdaptiveData}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
              Actualiser données
            </button>
          </div>
        </div>
      </div>

      {/* 2. SECTION 1 : DERNIÈRE DÉCISION OPÉRATIONNELLE */}
      <section aria-labelledby="operational-routing-heading" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <h3 id="operational-routing-heading" className="text-sm font-bold text-white uppercase tracking-wider">
                Dernière Décision Opérationnelle
              </h3>
              <p className="text-xs text-slate-400">
                Décision réelle issue de l'exécution en conditions réelles par l'orchestrateur de workflow.
              </p>
            </div>
          </div>

          {operationalDecision && (() => {
            const verified = operationalDecision.isIdentityVerified ?? operationalDecision.proof?.isIdentityVerified;
            if (verified === true || operationalDecision.identityStatus === 'VERIFIED') {
              return (
                <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Identité : VERIFIED
                </span>
              );
            }
            if (verified === false || operationalDecision.identityStatus === 'NOT_VERIFIED') {
              return (
                <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Identité : NOT VERIFIED
                </span>
              );
            }
            return (
              <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                Identité : UNKNOWN
              </span>
            );
          })()}
        </div>

        {operationalDecision ? (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Modèle Sélectionné
                </span>
                <div className="text-sm font-bold text-emerald-400 font-mono truncate">
                  {operationalDecision.selectedModelId}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 uppercase font-mono">
                  {operationalDecision.decisionType}
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Provider
                </span>
                <div className="text-sm font-bold text-blue-400 uppercase font-mono">
                  {operationalDecision.selectedProviderId}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Multi-fournisseurs actif</div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Catégorie & Complexité
                </span>
                <div className="text-xs font-bold text-slate-100 truncate">
                  {operationalDecision.classifiedProblem?.category}
                </div>
                <div className="text-[11px] text-violet-400 mt-1 font-mono font-semibold">
                  Complexité : {operationalDecision.classifiedProblem?.complexity || 'MEDIUM'}
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Confiance & Sécurité
                </span>
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {typeof operationalDecision.confidence === 'number'
                    ? `${(operationalDecision.confidence * 100).toFixed(0)}%`
                    : '100%'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Invariants vérifiés
                </div>
              </div>
            </div>

            {operationalDecision.reason && (
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-400 font-semibold block mb-1">Justification opérationnelle :</strong>
                <span>{operationalDecision.reason}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 text-center text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80">
            {isLoadingOperational ? (
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Recherche de la dernière décision opérationnelle...</span>
              </div>
            ) : (
              <p>
                Aucune décision opérationnelle enregistrée pour le moment. Exécutez un workflow AgentTeam pour observer une sélection réelle de modèle.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3. SECTION 2 : INSPECTION DE ROUTAGE (TEST & SIMULATION) */}
      <section aria-labelledby="inspection-routing-heading" className="bg-slate-900 border border-violet-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 id="inspection-routing-heading" className="text-sm font-bold text-white uppercase tracking-wider">
                Inspection de Routage
              </h3>
              <p className="text-xs text-slate-400">
                Évaluez interactivement la décision algorithmique projetée selon la consigne, les données mesurées et les contraintes.
              </p>
            </div>
          </div>

          {inspectionDecision && (() => {
            const verified = inspectionDecision.isIdentityVerified ?? inspectionDecision.proof?.isIdentityVerified;
            if (verified === true || inspectionDecision.identityStatus === 'VERIFIED') {
              return (
                <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Identité : VERIFIED
                </span>
              );
            }
            if (verified === false || inspectionDecision.identityStatus === 'NOT_VERIFIED') {
              return (
                <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Identité : NOT VERIFIED
                </span>
              );
            }
            return (
              <span className="self-start sm:self-auto px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                Identité : UNKNOWN
              </span>
            );
          })()}
        </div>

        {/* Input box for test prompt */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 pt-1">
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
            placeholder="Saisissez une consigne ou un problème pour tester la décision de routage..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-all font-sans"
          />
          <button
            id="inspect-routing-btn"
            type="button"
            onClick={() => handleInspectRouting()}
            disabled={isSelecting || !inspectorPrompt.trim()}
            className="px-5 py-2.5 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isSelecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Routage en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Évaluer décision
              </>
            )}
          </button>
        </div>

        {selectionError && (
          <ActionableErrorCard
            title="Erreur lors de la détermination du routing"
            error={selectionError}
            onRetry={() => handleInspectRouting()}
          />
        )}

        {/* Structured Current Routing Cards */}
        {inspectionDecision ? (
          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Modèle sélectionné */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Modèle Sélectionné
                </span>
                <div className="text-sm font-bold text-emerald-400 font-mono truncate">
                  {inspectionDecision.selectedModelId}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 uppercase font-mono">
                  {inspectionDecision.decisionType}
                </div>
              </div>

              {/* Provider */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Provider
                </span>
                <div className="text-sm font-bold text-blue-400 uppercase font-mono">
                  {inspectionDecision.selectedProviderId}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Multi-fournisseurs actif</div>
              </div>

              {/* Catégorie & Complexité */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Catégorie & Complexité
                </span>
                <div className="text-xs font-bold text-slate-100 truncate">
                  {inspectionDecision.classifiedProblem?.category}
                </div>
                <div className="text-[11px] text-violet-400 mt-1 font-mono font-semibold">
                  Complexité : {inspectionDecision.classifiedProblem?.complexity || 'MEDIUM'}
                </div>
              </div>

              {/* Confiance & Statut Invariant */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Confiance & Sécurité
                </span>
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {(inspectionDecision.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-[11px] mt-1 font-mono flex items-center gap-1">
                  {(inspectionDecision.isIdentityVerified ?? inspectionDecision.proof?.isIdentityVerified) === true ? (
                    <span className="text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400 inline" /> Identité : VERIFIED
                    </span>
                  ) : (inspectionDecision.isIdentityVerified ?? inspectionDecision.proof?.isIdentityVerified) === false ? (
                    <span className="text-rose-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400 inline" /> Identité : NOT VERIFIED
                    </span>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" /> Identité : UNKNOWN
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contraintes respectées */}
            {inspectionDecision.classifiedProblem?.constraints?.length > 0 && (
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-2 flex-wrap text-xs">
                <span className="font-semibold text-slate-400 flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                  Contraintes respectées :
                </span>
                {inspectionDecision.classifiedProblem.constraints.map((c: string) => (
                  <span
                    key={c}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-200 rounded font-mono"
                  >
                    ✓ {c}
                  </span>
                ))}
              </div>
            )}

            {/* Raison de sélection */}
            <div className="p-3.5 bg-violet-950/20 border border-violet-500/30 rounded-xl text-xs text-slate-200 leading-relaxed">
              <strong className="text-violet-300 font-semibold block mb-1">Raison de sélection simulée :</strong>
              <span>{inspectionDecision.reason}</span>
            </div>
          </div>
        ) : (
          <div className="p-5 text-center text-xs text-slate-500 bg-slate-950/30 rounded-xl border border-slate-800/60">
            Saisissez une consigne ou utilisez l'exemple ci-dessus, puis cliquez sur « Évaluer décision » pour tester la sélection algorithmique.
          </div>
        )}
      </section>

      {/* 3. OVERVIEW METRICS: DONNÉES OPÉRATIONNELLES VS BENCHMARKS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Modèles Référencés
          </span>
          <div className="text-2xl font-bold text-slate-100 mt-1 font-mono">{models.length}</div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Providers actifs</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Mesurés en Opérationnel
          </span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {models.filter((m) => m.status === 'MEASURED').length}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Données réelles (REAL_TASK)</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Exploration Adaptative
          </span>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">
            {models.filter((m) => m.status === 'UNMEASURED' || m.status === 'LOW_CONFIDENCE').length}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">En cours d'apprentissage</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Évaluations
          </span>
          <div className="text-2xl font-bold text-violet-400 mt-1 font-mono">
            {Object.values(rankings).reduce((acc, curr) => acc + curr.totalSamples, 0)}
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">Vérifications empiriques</span>
        </div>
      </div>

      {/* 4. CLASSEMENTS EMPIRIQUES PAR CATÉGORIE & REGISTRE DES MODÈLES */}
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
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
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
                      Aucune évaluation enregistrée pour la catégorie {selectedCategory} pour l'instant.
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
            <p className="text-xs text-slate-400 mt-0.5">Disponibilité et métadonnées multi-providers</p>
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

      {/* 5. SÉPARATION VISUELLE EXPLICITE : BENCHMARKS OBJECTIFS (HERMETIC_FIXTURE) */}
      <section aria-labelledby="benchmarks-heading" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono font-bold">
                ISOLATION HERMÉTIQUE
              </span>
              <h3 id="benchmarks-heading" className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Suite de Benchmarks Objectifs (HERMETIC_FIXTURE)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Évaluations hermétiques reproductibles exécutées dans une sandbox isolée sans appel externe ni pollution des données opérationnelles de production.
            </p>
          </div>

          <button
            id="run-hermetic-bench-btn"
            type="button"
            onClick={handleRunHermeticBenchmark}
            disabled={isRunningBenchmark}
            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            {isRunningBenchmark ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Benchmark en cours...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                Lancer Benchmark Objectif ({selectedCategory})
              </>
            )}
          </button>
        </div>

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
                  Run ID : <code className="font-mono text-slate-300">{benchmarkResult.runId}</code> ·{' '}
                  {benchmarkResult.evaluations?.length || 0} évaluations intégrées en mémoire empirique.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-mono text-emerald-400/90 bg-slate-950 px-2.5 py-1 rounded border border-emerald-500/20">
              Coût estimé : ${(benchmarkResult.totalCost || 0).toFixed(6)}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
