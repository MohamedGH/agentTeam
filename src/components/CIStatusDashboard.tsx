import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Layers,
  GitCommit,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { DeliveryState, CiJob, CiStep } from '../managers/deliveryStateManager';

interface CIStatusDashboardProps {
  delivery: DeliveryState;
  configured: boolean;
  onRefresh?: () => void;
}

export const CIStatusDashboard: React.FC<CIStatusDashboardProps> = ({
  delivery,
  configured,
  onRefresh,
}) => {
  const {
    trackedSha,
    commitSha,
    ciRun,
    ciStatus,
    ciConclusion,
    jobs,
    pollAttempts,
    isPolling,
    updatedAt,
  } = delivery;

  // Strict SHA correlation: if trackedSha is set, only accept a run where head_sha === trackedSha
  const isShaVerified = Boolean(trackedSha && ciRun && ciRun.head_sha === trackedSha);
  const displayRun = trackedSha ? (isShaVerified ? ciRun : null) : ciRun;

  // Compute health metrics across jobs & steps
  const totalJobs = displayRun ? jobs.length : 0;
  const completedJobs = displayRun
    ? jobs.filter((j) => j.status === 'completed' && j.conclusion === 'success').length
    : 0;
  const failedJobs = displayRun
    ? jobs.filter((j) => j.status === 'completed' && j.conclusion === 'failure').length
    : 0;

  const allSteps: CiStep[] = displayRun
    ? jobs.flatMap((j: CiJob) => (Array.isArray(j.steps) ? j.steps : []))
    : [];
  const totalSteps = allSteps.length;
  const passedSteps = allSteps.filter((s) => s.conclusion === 'success').length;
  const stepHealthPct = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header & SHA Verification Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Timeline & Métriques de Santé GitHub Actions
              </h4>
              {trackedSha && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    isShaVerified
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {isShaVerified
                    ? `SHA Vérifié (${trackedSha.slice(0, 7)})`
                    : `Attente SHA (${trackedSha.slice(0, 7)})`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Corrélation stricte <code className="text-slate-300">head_sha === trackedSha</code> sans fallback inter-commit.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {updatedAt && (
            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Mis à jour : {new Date(updatedAt).toLocaleTimeString()}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isPolling || !configured}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold transition disabled:opacity-40 cursor-pointer"
            >
              Vérifier
            </button>
          )}
        </div>
      </div>

      {/* Health Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-500 block font-bold">
            Commit Suivi (trackedSha)
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
            <GitCommit className="w-3.5 h-3.5 shrink-0" />
            {trackedSha ? trackedSha.slice(0, 10) : commitSha ? commitSha.slice(0, 10) : 'Aucun SHA'}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-500 block font-bold">
            Statut Pipeline
          </span>
          <span
            className={`text-xs font-mono font-bold block mt-0.5 ${
              ciStatus === 'TERMINAL_SUCCESS'
                ? 'text-emerald-400'
                : ciStatus === 'TERMINAL_FAILURE' || ciStatus === 'POLLING_FAILED_NETWORK'
                ? 'text-rose-400'
                : ciStatus === 'RUNNING' || ciStatus === 'WAITING_WORKFLOW' || ciStatus === 'QUEUED'
                ? 'text-amber-400'
                : 'text-slate-400'
            }`}
          >
            {ciStatus}
            {ciConclusion ? ` (${ciConclusion})` : ''}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-500 block font-bold">
            Santé des Jobs / Étapes
          </span>
          <span className="text-xs font-mono font-bold text-slate-200 block mt-0.5">
            {totalJobs > 0
              ? `${completedJobs}/${totalJobs} jobs · ${stepHealthPct}% étapes`
              : displayRun
              ? 'Jobs en initialisation'
              : '—'}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-500 block font-bold">
            Tentatives Polling
          </span>
          <span className="text-xs font-mono font-bold text-blue-300 block mt-0.5">
            {pollAttempts} / 20 {isPolling ? '(actif)' : '(repos)'}
          </span>
        </div>
      </div>

      {/* Detailed Timeline */}
      {displayRun ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-mono">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-white font-bold">{displayRun.name || 'Workflow CI'}</span>
              <span className="text-amber-400">#{displayRun.id}</span>
              <span className="text-slate-500">({displayRun.head_sha.slice(0, 7)})</span>
            </div>
            {displayRun.html_url && (
              <a
                href={displayRun.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-[11px]"
              >
                GitHub Actions <ArrowUpRight className="w-3 h-3" />
              </a>
            )}
          </div>

          {jobs.length > 0 && (
            <div className="space-y-2.5">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      {job.conclusion === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : job.conclusion === 'failure' ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                      )}
                      Job: {job.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        job.conclusion === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : job.conclusion === 'failure'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {job.conclusion || job.status}
                    </span>
                  </div>

                  {Array.isArray(job.steps) && job.steps.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                      {job.steps.map((step, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center justify-between text-[11px] font-mono bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800/70"
                        >
                          <span className="text-slate-300 truncate pr-2">
                            {step.number ? `${step.number}. ` : ''}
                            {step.name}
                          </span>
                          <span
                            className={`shrink-0 font-semibold ${
                              step.conclusion === 'success'
                                ? 'text-emerald-400'
                                : step.conclusion === 'failure'
                                ? 'text-rose-400'
                                : step.status === 'in_progress'
                                ? 'text-amber-400 animate-pulse'
                                : 'text-slate-500'
                            }`}
                          >
                            {step.conclusion || step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {failedJobs > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {failedJobs} job(s) en échec détecté(s) sur le commit {displayRun.head_sha.slice(0, 7)}.
              </span>
            </div>
          )}
        </div>
      ) : trackedSha ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5 text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPolling ? (
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>
              {isPolling
                ? `Recherche active du workflow GitHub Actions correspondant exactement au SHA ${trackedSha.slice(0, 7)}...`
                : `Aucun workflow correspondant au SHA ${trackedSha.slice(0, 7)} après ${pollAttempts} tentatives.`}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500 shrink-0">
            Zéro fallback runs[0]
          </span>
        </div>
      ) : null}
    </div>
  );
};
