import React, { useState } from 'react';
import {
  useSelfImprovementState,
} from '../managers/useSelfImprovementState';
import { CyclePhase } from '../managers/selfImprovementStateManager';
import {
  Activity,
  Play,
  RotateCcw,
  ShieldCheck,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import { formatDate } from '../utils/functional';

const PHASES: Array<{ key: CyclePhase; label: string }> = [
  { key: 'OBSERVE', label: 'Observe' },
  { key: 'ANALYSE', label: 'Analyse' },
  { key: 'DETECT', label: 'Détecte' },
  { key: 'PLAN', label: 'Planifie' },
  { key: 'MODIFY', label: 'Modifie' },
  { key: 'TEST', label: 'Teste' },
  { key: 'REVIEW', label: 'Review' },
  { key: 'QUALITY_GATE', label: 'Quality Gate' },
  { key: 'INTEGRATE', label: 'Intègre' },
  { key: 'OBSERVE_AGAIN', label: 'Observe à nouveau' },
];

export const SelfImprovementDashboard: React.FC = () => {
  const {
    currentCycle,
    cycles,
    isRunning,
    isRollingBack,
    activePhase,
    error,
    runCycle,
    rollbackCycle,
    refresh,
  } = useSelfImprovementState();

  const [autoIntegrate, setAutoIntegrate] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  const displayCycle =
    (selectedCycleId && cycles.find((c) => c.id === selectedCycleId)) ||
    currentCycle ||
    cycles[0] ||
    null;

  const currentPhaseIndex = displayCycle
    ? PHASES.findIndex((p) => p.key === (displayCycle.currentPhase || activePhase))
    : -1;

  const handleStartCycle = async () => {
    await runCycle({
      autoIntegrate,
      commitAndPush: autoIntegrate,
      createPullRequest: autoIntegrate,
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <Cpu className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Self-Improvement Autonomous Engine
              </h1>
            </div>
            <p className="text-sm text-slate-400">
              Autonomous self-healing loop: OBSERVE → ANALYSE → DÉTECTE → PLANIFIE → MODIFIE → TESTE → REVIEW → QUALITY GATE → INTÈGRE → OBSERVE À NOUVEAU
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoIntegrate}
                onChange={(e) => setAutoIntegrate(e.target.checked)}
                className="rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Auto-Delivery (PR via WorkflowOrchestrator)</span>
            </label>

            <button
              id="btn-refresh-self-improve"
              onClick={() => refresh()}
              disabled={isRunning}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="btn-run-self-improvement"
              onClick={handleStartCycle}
              disabled={isRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${
                isRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>{isRunning ? 'Running Cycle...' : 'Run Self-Improvement Cycle'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error.message}</span>
          </div>
        )}
      </div>

      {/* 10-Phase Interactive Stepper */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm overflow-hidden">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          Autonomous 10-Phase Pipeline
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {PHASES.map((phase, idx) => {
            const isCompleted = currentPhaseIndex > idx;
            const isCurrent = currentPhaseIndex === idx;
            const isPending = currentPhaseIndex < idx;

            return (
              <div
                key={phase.key}
                className={`relative flex flex-col items-center p-3 rounded-lg border text-center transition ${
                  isCurrent
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30 font-semibold'
                    : isCompleted
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800/40 border-slate-800 text-slate-500'
                }`}
              >
                <span className="text-[10px] font-mono mb-1 text-slate-400">
                  0{idx + 1}
                </span>
                <span className="text-xs font-medium truncate w-full">
                  {phase.label}
                </span>
                <div className="mt-2">
                  {isCurrent ? (
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current/Selected Cycle Details */}
      {displayCycle ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Inspection Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Target Problem Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Detected Defect & Improvement Target
                </h3>
                {displayCycle.selectedProblem && (
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      displayCycle.selectedProblem.severity === 'CRITICAL'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : displayCycle.selectedProblem.severity === 'HIGH'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}
                  >
                    {displayCycle.selectedProblem.severity}
                  </span>
                )}
              </div>

              {displayCycle.selectedProblem ? (
                <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-sm font-medium text-slate-200">
                    {displayCycle.selectedProblem.title}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {displayCycle.selectedProblem.description}
                  </p>
                  <div className="text-xs text-indigo-300 font-mono pt-1">
                    Suggested fix: {displayCycle.selectedProblem.suggestedFix}
                  </div>
                  {displayCycle.selectedProblem.targetFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {displayCycle.selectedProblem.targetFiles.map((file) => (
                        <span
                          key={file}
                          className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>No actionable defects detected. Application is healthy.</span>
                </div>
              )}
            </div>

            {/* Improvement Plan Card */}
            {displayCycle.plan && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  Executed Plan & Verification
                </h3>

                <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      {displayCycle.plan.title}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Risk: {displayCycle.plan.riskLevel}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {displayCycle.plan.steps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="flex items-start gap-2 text-xs text-slate-300"
                      >
                        <span className="text-indigo-400 font-mono shrink-0">
                          Step {step.stepNumber}:
                        </span>
                        <span>{step.description}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
                    Verification: <code className="text-amber-300">{displayCycle.plan.verificationCommand}</code>
                  </div>
                </div>
              </div>
            )}

            {/* Live Telemetry & Phase Log */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                Phase Logs & Observability
              </h3>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs">
                {displayCycle.log && displayCycle.log.length > 0 ? (
                  displayCycle.log.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-slate-500 text-[10px] shrink-0 pt-0.5">
                        {formatDate(entry.timestamp)}
                      </span>
                      <span className="text-indigo-400 shrink-0">
                        [{entry.phase}]
                      </span>
                      <span className="text-slate-300 break-words">
                        {entry.message}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic">No events logged yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Verification & Quality Gate Sidebar */}
          <div className="space-y-6">
            {/* Gate Status Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Quality Gate & Review
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <span className="text-slate-300">Automated Tests</span>
                  {displayCycle.evaluation ? (
                    displayCycle.evaluation.testsPassed ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </span>
                    ) : (
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">PENDING</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <span className="text-slate-300">Security & Architecture</span>
                  {displayCycle.evaluation ? (
                    displayCycle.evaluation.reviewApproved ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> APPROVED
                      </span>
                    ) : (
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> REJECTED
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">PENDING</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <span className="text-slate-300">Quality Gate Clearance</span>
                  {displayCycle.evaluation ? (
                    displayCycle.evaluation.gateAuthorized ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AUTHORIZED
                      </span>
                    ) : (
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> FORBIDDEN
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">PENDING</span>
                  )}
                </div>
              </div>

              {/* Git Delivery Status */}
              {displayCycle.gitDelivery && displayCycle.gitDelivery.delivered && (
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg space-y-1 text-xs">
                  <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                    <GitPullRequest className="w-3.5 h-3.5" /> Delivered to GitHub
                  </div>
                  {displayCycle.gitDelivery.pullRequestUrl && (
                    <a
                      href={displayCycle.gitDelivery.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 underline hover:text-indigo-300 truncate block"
                    >
                      {displayCycle.gitDelivery.pullRequestUrl}
                    </a>
                  )}
                  {displayCycle.gitDelivery.commitSha && (
                    <div className="text-slate-400 font-mono text-[11px]">
                      Commit: {displayCycle.gitDelivery.commitSha.slice(0, 7)}
                    </div>
                  )}
                </div>
              )}

              {/* Rollback Action */}
              <button
                id="btn-rollback-cycle"
                onClick={() => rollbackCycle(displayCycle.id)}
                disabled={isRollingBack || displayCycle.status === 'ROLLED_BACK'}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {isRollingBack
                    ? 'Reverting...'
                    : displayCycle.status === 'ROLLED_BACK'
                    ? 'Reverted'
                    : 'Revert / Rollback Cycle'}
                </span>
              </button>
            </div>

            {/* Prior Cycles History */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Cycle History</span>
                <span className="text-xs text-slate-400 font-mono">{cycles.length}</span>
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {cycles.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCycleId(c.id)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition flex items-center justify-between ${
                      (selectedCycleId === c.id || (!selectedCycleId && displayCycle.id === c.id))
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-mono text-[10px] text-slate-500">
                        {formatDate(c.startedAt)}
                      </div>
                      <div className="truncate font-medium">
                        {c.selectedProblem?.title || c.id}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        c.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : c.status === 'ROLLED_BACK'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Cpu className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-medium text-slate-300">No Cycles Recorded</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click "Run Self-Improvement Cycle" to start autonomous observation and defect remediation.
          </p>
        </div>
      )}
    </div>
  );
};
