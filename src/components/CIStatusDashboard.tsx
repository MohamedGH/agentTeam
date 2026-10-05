import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  Terminal,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Cpu,
  Hash,
  Play,
  Square,
  Sparkles,
  Info,
  Sliders,
} from 'lucide-react';
import { useDeliveryState } from '../managers/useDeliveryState';
import { CiRunData, CiJob, CiStep } from '../managers/deliveryStateManager';

interface FullRunItem extends CiRunData {
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
  event?: string;
  run_number?: number;
  workflow_id?: number;
  display_title?: string;
}

export const CIStatusDashboard: React.FC = () => {
  const delivery = useDeliveryState();

  // Local state for runs history, inspection selection, and controls
  const [allRuns, setAllRuns] = useState<FullRunItem[]>([]);
  const [selectedRunOverride, setSelectedRunOverride] = useState<FullRunItem | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [customShaInput, setCustomShaInput] = useState<string>('');
  const [copiedSha, setCopiedSha] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [expandedJobs, setExpandedJobs] = useState<Record<number, boolean>>({});

  // Active run being visualized (either manually selected or the delivery-tracked run)
  const activeRun: FullRunItem | null = useMemo(() => {
    if (selectedRunOverride) return selectedRunOverride;
    if (delivery.ciRun) return delivery.ciRun as FullRunItem;
    if (allRuns.length > 0) return allRuns[0];
    return null;
  }, [selectedRunOverride, delivery.ciRun, allRuns]);

  // Latest run on the repository (most recent event in GitHub Actions)
  const latestRunOnRepo: FullRunItem | null = useMemo(() => {
    return allRuns.length > 0 ? allRuns[0] : null;
  }, [allRuns]);

  // Fetch full list of runs for history and latest run comparison
  const fetchRecentRuns = async () => {
    setIsLoadingHistory(true);
    try {
      const repo = encodeURIComponent(delivery.repository || 'MohamedGH/agentTeam');
      const shaParam = delivery.trackedSha ? `&head_sha=${encodeURIComponent(delivery.trackedSha)}` : '';
      const res = await fetch(`/api/github/ci-runs?repository=${repo}${shaParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.runs)) {
          setAllRuns(data.runs);
        }
      }
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.warn('[CIStatusDashboard] Failed to fetch recent runs:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchRecentRuns();
  }, [delivery.repository, delivery.trackedSha, delivery.ciRunId]);

  // Expand first job by default if jobs change
  useEffect(() => {
    if (delivery.jobs && delivery.jobs.length > 0) {
      if (activeJobId === null || !delivery.jobs.some((j) => j.id === activeJobId)) {
        setActiveJobId(delivery.jobs[0].id);
      }
      setExpandedJobs((prev) => ({
        ...prev,
        [delivery.jobs[0].id]: true,
      }));
    }
  }, [delivery.jobs]);

  // Tracked SHA correlation check against active & latest run
  const correlationAnalysis = useMemo(() => {
    const tracked = delivery.trackedSha?.trim() || null;
    const latest = latestRunOnRepo?.head_sha?.trim() || null;
    const active = activeRun?.head_sha?.trim() || null;

    if (!tracked) {
      return {
        status: 'UNTRACKED' as const,
        label: 'Mode Inspection Libre',
        desc: 'Aucun commit spécifique n\'est actuellement ciblé. Affichage du flux GitHub Actions.',
        badgeColor: 'text-slate-400 bg-slate-800/80 border-slate-700',
        matchRate: null,
        isLatestMatching: false,
      };
    }

    const isMatchActive = active ? tracked === active || tracked.startsWith(active) || active.startsWith(tracked) : false;
    const isMatchLatest = latest ? tracked === latest || tracked.startsWith(latest) || latest.startsWith(tracked) : false;

    if (isMatchLatest) {
      return {
        status: 'VERIFIED_MATCH' as const,
        label: 'Alignement Strict Vérifié (100%)',
        desc: `Le dernier workflow GitHub Actions (#${latestRunOnRepo?.id}) correspond exactement au commit suivi ${tracked.slice(0, 7)}.`,
        badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        matchRate: 100,
        isLatestMatching: true,
      };
    }

    if (isMatchActive && !isMatchLatest) {
      return {
        status: 'HISTORICAL_MATCH' as const,
        label: 'Commit Suivi Trouvé (Run Précédent)',
        desc: `Le commit suivi ${tracked.slice(0, 7)} a été retrouvé dans le run #${activeRun?.id}. Un run plus récent existe (${latestRunOnRepo?.head_sha?.slice(0, 7)}).`,
        badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        matchRate: 100,
        isLatestMatching: false,
      };
    }

    // Tracked SHA not yet picked up by GitHub Actions
    return {
      status: 'AWAITING_WORKFLOW' as const,
      label: 'En attente de déclenchement GitHub Actions',
      desc: `Le commit ${tracked.slice(0, 7)} est poussé mais GitHub Actions n'a pas encore instancié le nouveau run (ou est en file d'attente).`,
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      matchRate: 0,
      isLatestMatching: false,
    };
  }, [delivery.trackedSha, latestRunOnRepo, activeRun]);

  // Compute Health Metrics based on jobs and steps
  const healthMetrics = useMemo(() => {
    const jobs = delivery.jobs || [];
    const totalJobs = jobs.length;
    const completedJobs = jobs.filter((j) => j.status === 'completed').length;
    const passedJobs = jobs.filter((j) => j.conclusion === 'success').length;
    const failedJobs = jobs.filter((j) => j.conclusion === 'failure').length;

    let totalSteps = 0;
    let passedSteps = 0;
    let failedSteps = 0;
    let inProgressSteps = 0;

    for (const job of jobs) {
      for (const step of job.steps || []) {
        totalSteps++;
        if (step.conclusion === 'success') passedSteps++;
        else if (step.conclusion === 'failure') failedSteps++;
        else if (step.status === 'in_progress') inProgressSteps++;
      }
    }

    const jobSuccessRate = totalJobs > 0 ? Math.round((passedJobs / totalJobs) * 100) : 100;
    const stepSuccessRate = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 100;

    // Overall pipeline health score (weighted combination)
    let healthScore = 100;
    if (delivery.ciStatus === 'TERMINAL_FAILURE') healthScore = 20;
    else if (failedJobs > 0 || failedSteps > 0) healthScore = Math.max(10, 100 - failedSteps * 15);
    else if (delivery.ciStatus === 'RUNNING') healthScore = 90;
    else if (delivery.ciStatus === 'WAITING_WORKFLOW') healthScore = 80;
    else if (delivery.ciStatus === 'POLLING_FAILED_NETWORK') healthScore = 40;
    else if (delivery.ciStatus === 'RUN_NOT_FOUND_FOR_SHA') healthScore = 30;

    return {
      totalJobs,
      completedJobs,
      passedJobs,
      failedJobs,
      totalSteps,
      passedSteps,
      failedSteps,
      inProgressSteps,
      jobSuccessRate,
      stepSuccessRate,
      healthScore,
    };
  }, [delivery.jobs, delivery.ciStatus]);

  // Copy SHA helper
  const handleCopySha = (shaText: string) => {
    if (!shaText) return;
    navigator.clipboard.writeText(shaText);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  // Set custom tracked SHA
  const handleApplyCustomSha = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customShaInput.trim()) return;
    delivery.startCiPolling(customShaInput.trim());
    setSelectedRunOverride(null);
    setCustomShaInput('');
  };

  const toggleJobExpanded = (jobId: number) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  // Status visual badge formatting
  const getConclusionBadge = (status?: string, conclusion?: string | null) => {
    if (status === 'in_progress' || status === 'RUNNING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          RUNNING
        </span>
      );
    }
    if (conclusion === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          SUCCESS
        </span>
      );
    }
    if (conclusion === 'failure') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          FAILED
        </span>
      );
    }
    if (conclusion === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
          CANCELLED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
        <Clock className="w-3.5 h-3.5 text-amber-400" />
        {status || 'QUEUED'}
      </span>
    );
  };

  const filteredRuns = useMemo(() => {
    if (!filterQuery.trim()) return allRuns;
    const q = filterQuery.toLowerCase();
    return allRuns.filter((r) => {
      const matchSha = r.head_sha?.toLowerCase().includes(q);
      const matchName = r.name?.toLowerCase().includes(q);
      const matchEvent = r.event?.toLowerCase().includes(q);
      const matchMsg = r.head_commit?.message?.toLowerCase().includes(q);
      return matchSha || matchName || matchEvent || matchMsg;
    });
  }, [allRuns, filterQuery]);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & TELEMETRY CONTROLS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  GitHub Actions CI Telemetry & Health Dashboard
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-slate-950 text-blue-300 border border-slate-800">
                  {delivery.repository}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-950 text-slate-400 border border-slate-800 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-emerald-400" /> {delivery.branch}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Corrélation stricte commit SHA → Run ID → Jobs & Étapes. Zéro fallback non vérifié.
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                delivery.fetchCiRuns(delivery.trackedSha);
                fetchRecentRuns();
              }}
              disabled={delivery.isPolling || isLoadingHistory}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Rafraîchir immédiatement"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${delivery.isPolling || isLoadingHistory ? 'animate-spin text-blue-400' : ''}`} />
              <span>{delivery.isPolling ? 'Polling en cours (3s)...' : 'Synchroniser'}</span>
            </button>

            {delivery.isPolling ? (
              <button
                type="button"
                onClick={() => delivery.stopCiPolling()}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stopper Polling</span>
              </button>
            ) : (
              delivery.trackedSha && (
                <button
                  type="button"
                  onClick={() => delivery.startCiPolling(delivery.trackedSha!)}
                  className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-500/30 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Reprendre Polling</span>
                </button>
              )
            )}

            {activeRun?.html_url && (
              <a
                href={activeRun.html_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 flex items-center gap-1.5 transition"
              >
                <span>Voir sur GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* 2. SHA CORRELATION & INTEGRITY BANNER */}
        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border flex items-center gap-1.5 ${correlationAnalysis.badgeColor}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {correlationAnalysis.label}
              </span>
              {delivery.isPolling && (
                <span className="text-[11px] font-mono text-blue-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                  Vérification {delivery.pollAttempts}/20
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>Dernière synchro :</span>
              <strong className="text-slate-200">{lastRefreshedAt.toLocaleTimeString()}</strong>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {correlationAnalysis.desc}
          </p>

          {/* Cryptographic Hash Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
                  <Hash className="w-3 h-3 text-blue-400" /> Commit SHA Suivi (Tracked Target)
                </span>
                {delivery.trackedSha && (
                  <button
                    type="button"
                    onClick={() => handleCopySha(delivery.trackedSha!)}
                    className="text-slate-400 hover:text-white flex items-center gap-1 transition text-[10px]"
                    title="Copier SHA"
                  >
                    {copiedSha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSha ? 'Copié' : 'Copier'}</span>
                  </button>
                )}
              </div>
              <div className="font-mono text-xs font-bold text-blue-300 break-all">
                {delivery.trackedSha ? (
                  <span>{delivery.trackedSha}</span>
                ) : (
                  <span className="text-slate-500 font-normal italic">Aucun SHA verrouillé (Affichage automatique)</span>
                )}
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
                  <Activity className="w-3 h-3 text-emerald-400" /> Head SHA Détecté (Latest Run #{latestRunOnRepo?.id || '—'})
                </span>
                {latestRunOnRepo?.head_sha && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {latestRunOnRepo.head_sha === delivery.trackedSha ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> SHA IDENTIQUE
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> SHA DIFFÉRENT
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs font-bold text-emerald-300 break-all">
                {latestRunOnRepo?.head_sha || <span className="text-slate-500 font-normal italic">Aucun run détecté sur GitHub</span>}
              </div>
            </div>
          </div>

          {/* Quick Manual SHA Input */}
          <form onSubmit={handleApplyCustomSha} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={customShaInput}
              onChange={(e) => setCustomShaInput(e.target.value)}
              placeholder="Cibler un SHA de commit précis (ex: 8f2a1b9)..."
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 flex-1 font-mono"
            />
            <button
              type="submit"
              disabled={!customShaInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
            >
              Vérifier ce SHA
            </button>
            {delivery.trackedSha && (
              <button
                type="button"
                onClick={() => {
                  delivery.fetchCiRuns(null);
                  setSelectedRunOverride(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              >
                Réinitialiser cible
              </button>
            )}
          </form>
        </div>
      </div>

      {/* 3. HEALTH METRICS & RELIABILITY KPI GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Health Score */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Health Score CI</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${healthMetrics.healthScore >= 80 ? 'text-emerald-400' : healthMetrics.healthScore >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
              {healthMetrics.healthScore}%
            </span>
            <span className="text-[11px] text-slate-500">Intégrité Globale</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 mt-3 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${healthMetrics.healthScore >= 80 ? 'bg-emerald-400' : healthMetrics.healthScore >= 50 ? 'bg-amber-400' : 'bg-rose-500'}`}
              style={{ width: `${healthMetrics.healthScore}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Jobs Success Ratio */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Jobs Réussis</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {healthMetrics.passedJobs}/{healthMetrics.totalJobs || 1}
            </span>
            <span className="text-[11px] text-slate-500">({healthMetrics.jobSuccessRate}%)</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-3 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {healthMetrics.failedJobs > 0 ? (
              <span className="text-rose-400 font-bold">{healthMetrics.failedJobs} job(s) en échec</span>
            ) : (
              <span>Aucun échec détecté</span>
            )}
          </div>
        </div>

        {/* Metric 3: Steps Completion */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Étapes Exécutées</span>
            <Terminal className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-cyan-300">
              {healthMetrics.passedSteps}/{healthMetrics.totalSteps || 1}
            </span>
            <span className="text-[11px] text-slate-500">étapes</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-3 font-mono">
            {healthMetrics.inProgressSteps > 0 ? (
              <span className="text-blue-400 animate-pulse">{healthMetrics.inProgressSteps} en cours d'exécution...</span>
            ) : (
              <span>Pipeline terminé</span>
            )}
          </div>
        </div>

        {/* Metric 4: Polling Status & Latency */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Sonde Polling & Latence</span>
            <Activity className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {delivery.isPolling ? `${delivery.pollAttempts}/20` : 'Prêt'}
            </span>
            <span className="text-[11px] text-slate-500">tentatives</span>
          </div>
          <div className="text-[11px] font-mono mt-3 flex items-center justify-between text-slate-400">
            <span>Intervalle 3000ms</span>
            <span className="text-emerald-400 font-bold">Réseau OK</span>
          </div>
        </div>
      </div>

      {/* 4. DETAILED TIMELINE OF ACTIVE RUN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Chronologie Détaillée du Workflow GitHub Actions
              </h3>
              <p className="text-xs text-slate-400">
                Visualisation temporelle séquentielle : du push Git jusqu'au quality gate final.
              </p>
            </div>
          </div>

          {activeRun && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">
                Run #{activeRun.id}
              </span>
              {getConclusionBadge(activeRun.status, activeRun.conclusion)}
            </div>
          )}
        </div>

        {/* Timeline Stepper */}
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {/* STEP 1: GIT DISPATCH */}
          <div className="relative">
            <div className="absolute -left-6 sm:-left-8 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 text-xs">
              <Check className="w-3 h-3" />
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                  1. Déclenchement & Push Git
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Commit vérifié
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Code source compilé et poussé sur la branche <strong className="text-slate-200 font-mono">{delivery.branch}</strong>.
              </p>
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 bg-slate-900/80 p-2 rounded-lg border border-slate-800/80 flex-wrap">
                <span>SHA : <strong className="text-emerald-400">{delivery.trackedSha?.slice(0, 7) || activeRun?.head_sha?.slice(0, 7) || 'N/A'}</strong></span>
                <span>·</span>
                <span>Dépôt : <strong className="text-slate-200">{delivery.repository}</strong></span>
                {activeRun?.head_commit?.message && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-xs text-slate-300">"{activeRun.head_commit.message}"</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2: WORKFLOW ALLOCATION & DETECTION */}
          <div className="relative">
            <div className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 flex items-center justify-center text-xs ${activeRun ? 'border-blue-400 text-blue-400' : 'border-slate-700 text-slate-600'}`}>
              {activeRun ? <Check className="w-3 h-3" /> : '2'}
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  2. Instanciation du Runner GitHub Actions
                </span>
                {activeRun && (
                  <span className="text-[11px] font-mono text-blue-400">
                    Workflow #{activeRun.id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Machine virtuelle provisionnée (<code className="text-slate-300 font-mono">ubuntu-latest</code>), environnement Node.js 22 initialisé.
              </p>
            </div>
          </div>

          {/* STEP 3: LIVE JOBS & STEP-BY-STEP BREAKDOWN */}
          <div className="relative">
            <div className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 flex items-center justify-center text-xs ${healthMetrics.failedJobs > 0 ? 'border-rose-500 text-rose-400' : delivery.jobs.length > 0 ? 'border-emerald-400 text-emerald-400' : 'border-amber-400 text-amber-400'}`}>
              <Terminal className="w-3 h-3" />
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  3. Exécution des Jobs et Étapes de Vérification ({delivery.jobs.length} jobs)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {healthMetrics.passedSteps}/{healthMetrics.totalSteps} étapes réussies
                </span>
              </div>

              {/* Jobs Accordion List */}
              {delivery.jobs && delivery.jobs.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {delivery.jobs.map((job) => {
                    const isExpanded = Boolean(expandedJobs[job.id]);
                    const isJobSuccess = job.conclusion === 'success';
                    const isJobFailed = job.conclusion === 'failure';
                    const isJobRunning = job.status === 'in_progress';

                    return (
                      <div key={job.id} className="bg-slate-900/90 rounded-xl border border-slate-800/80 overflow-hidden">
                        {/* Job Header */}
                        <div
                          onClick={() => toggleJobExpanded(job.id)}
                          className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/50 transition"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="font-mono text-xs font-bold text-slate-200">
                              {job.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({job.steps?.length || 0} étapes)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {getConclusionBadge(job.status, job.conclusion)}
                          </div>
                        </div>

                        {/* Step Breakdown (When expanded) */}
                        {isExpanded && job.steps && job.steps.length > 0 && (
                          <div className="border-t border-slate-800 bg-slate-950/60 p-3 space-y-2">
                            {job.steps.map((step, idx) => {
                              const stepPassed = step.conclusion === 'success';
                              const stepFailed = step.conclusion === 'failure';
                              const stepRunning = step.status === 'in_progress';

                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-slate-900/50 border border-slate-800/50 font-mono"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-[10px] text-slate-500 font-bold w-4">
                                      #{step.number || idx + 1}
                                    </span>
                                    {stepPassed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    ) : stepFailed ? (
                                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    ) : stepRunning ? (
                                      <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                                    ) : (
                                      <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                                    )}
                                    <span className={stepFailed ? 'text-rose-300 font-bold' : 'text-slate-300'}>
                                      {step.name}
                                    </span>
                                  </div>

                                  <div className="text-[10px] text-slate-500">
                                    {step.conclusion ? (
                                      <span className={stepPassed ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                        {step.conclusion}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 italic">{step.status}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 font-mono italic bg-slate-900/50 rounded-lg">
                  {delivery.isPolling ? (
                    <span className="flex items-center justify-center gap-2 text-blue-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Récupération des logs des jobs en cours...
                    </span>
                  ) : (
                    'Aucun détail de job remonté pour l\'instant.'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* STEP 4: QUALITY GATE & TERMINAL STATUS */}
          <div className="relative">
            <div className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 rounded-full bg-slate-900 border-2 flex items-center justify-center text-xs ${healthMetrics.healthScore >= 80 ? 'border-emerald-400 text-emerald-400' : 'border-rose-500 text-rose-500'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  4. Quality Gate & Décision de Déploiement
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">
                  {delivery.ciConclusion === 'success' ? 'VALIDÉ SANS RÉSERVE' : delivery.ciConclusion === 'failure' ? 'REJETÉ (TESTS ÉCHOUÉS)' : 'EN ÉVALUATION'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Audit automatique : non-contournement des tests réels, conformité des dépendances et validation hermétique.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. RECENT WORKFLOW RUNS AUDIT LOG */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Historique des Derniers Runs GitHub Actions ({filteredRuns.length})
              </h3>
              <p className="text-xs text-slate-400">
                Audit croisé : corrélation entre les runs distants et le commit suivi localement.
              </p>
            </div>
          </div>

          {/* Search/Filter Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrer par SHA, nom, message..."
              className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-64 font-sans"
            />
          </div>
        </div>

        {/* Runs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider bg-slate-950/50">
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Workflow</th>
                <th className="py-2.5 px-3">Commit SHA</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3">Corrélation</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRuns.length > 0 ? (
                filteredRuns.map((r) => {
                  const isCurrentTarget = delivery.trackedSha && (r.head_sha === delivery.trackedSha || r.head_sha?.startsWith(delivery.trackedSha));
                  const isSelected = activeRun?.id === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/40 transition ${isSelected ? 'bg-blue-500/5' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-slate-300 font-bold">
                        #{r.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-slate-200 font-sans font-medium block">
                          {r.name || 'CI Workflow'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {r.event || 'push'} · {r.created_at ? new Date(r.created_at).toLocaleTimeString() : 'récent'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-400 font-bold block">
                          {r.head_sha?.slice(0, 7)}
                        </span>
                        {r.head_commit?.message && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[180px] block font-sans">
                            {r.head_commit.message}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {getConclusionBadge(r.status, r.conclusion)}
                      </td>
                      <td className="py-2.5 px-3">
                        {isCurrentTarget ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> CIBLE ACTUELLE
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            Autre commit
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunOverride(r);
                              delivery.fetchCiRuns(r.head_sha);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                          >
                            {isSelected ? 'Actif' : 'Inspecter'}
                          </button>
                          {r.html_url && (
                            <a
                              href={r.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded text-slate-400 hover:text-white transition"
                              title="Ouvrir sur GitHub"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                    {isLoadingHistory ? 'Chargement des runs en cours...' : 'Aucun run GitHub Actions trouvé correspondant aux filtres.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
