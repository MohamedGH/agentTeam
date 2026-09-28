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
  ChevronDown,
  ChevronUp,
  Clock,
  Check,
} from 'lucide-react';
import { formatDate } from '../utils/functional';

const PHASES: Array<{ key: CyclePhase; label: string; description: string }> = [
  { key: 'OBSERVE', label: '1. Observer', description: 'Collecte des métriques et logs' },
  { key: 'ANALYSE', label: '2. Analyser', description: 'Évaluation des anomalies de performance' },
  { key: 'DETECT', label: '3. Détecter', description: 'Identification des défauts actionnables' },
  { key: 'PLAN', label: '4. Planifier', description: 'Génération du plan de remédiation' },
  { key: 'MODIFY', label: '5. Modifier', description: 'Application des correctifs de code' },
  { key: 'TEST', label: '6. Tester', description: 'Validation par tests automatisés' },
  { key: 'REVIEW', label: '7. Revue', description: 'Revue architecturale et sécuritaire' },
  { key: 'QUALITY_GATE', label: '8. Quality Gate', description: 'Contrôle strict des critères de livraison' },
  { key: 'INTEGRATE', label: '9. Intégrer', description: 'Commit Git et création de Pull Request' },
  { key: 'OBSERVE_AGAIN', label: '10. Post-Observation', description: 'Vérification de non-régression' },
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
  const [showFullStepper, setShowFullStepper] = useState(false);

  const displayCycle =
    (selectedCycleId && cycles.find((c) => c.id === selectedCycleId)) ||
    currentCycle ||
    cycles[0] ||
    null;

  const currentPhaseKey = displayCycle ? (displayCycle.currentPhase || activePhase) : activePhase;
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === currentPhaseKey);
  const activePhaseInfo = PHASES.find((p) => p.key === currentPhaseKey) || PHASES[0];

  const handleStartCycle = async () => {
    await runCycle({
      autoIntegrate,
      commitAndPush: autoIntegrate,
      createPullRequest: autoIntegrate,
    });
  };

  // Status visual badge formatting
  const getStatusBadge = (status?: string) => {
    if (isRunning) {
      return (
        <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 flex items-center gap-1.5 font-mono text-xs">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          ● RUNNING
        </span>
      );
    }
    if (status === 'COMPLETED') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1.5 font-mono text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ✓ COMPLETED
        </span>
      );
    }
    if (status === 'ROLLED_BACK') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1.5 font-mono text-xs">
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          ↩ ROLLED BACK
        </span>
      );
    }
    if (status === 'FAILED') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 flex items-center gap-1.5 font-mono text-xs">
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          ✕ FAILED
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5 font-mono text-xs">
        ○ PENDING
      </span>
    );
  };

  // Calculate progression percentage
  const progressPercent = currentPhaseIndex >= 0 ? Math.round(((currentPhaseIndex + 1) / 10) * 100) : 0;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Moteur d'Auto-Amélioration Autonome
                </h1>
                <p className="text-xs text-slate-400">
                  Boucle continue d'auto-guérison logicielle en 10 étapes vérifiées avec Quality Gate inviolable.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoIntegrate}
                onChange={(e) => setAutoIntegrate(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Auto-Livraison (Pull Request GitHub)</span>
            </label>

            <button
              id="btn-refresh-self-improve"
              onClick={() => refresh()}
              disabled={isRunning}
              className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition cursor-pointer"
              title="Actualiser la télémétrie"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="btn-run-self-improvement"
              onClick={handleStartCycle}
              disabled={isRunning}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                isRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isRunning ? 'Exécution du cycle...' : 'Lancer le cycle autonome'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error.message}</span>
          </div>
        )}
      </div>

      {/* PRIORITÉ 6 — RÉORGANISATION OPÉRATIONNELLE : ÉTAT GLOBAL, ACTION EN COURS & QUALITY GATE */}
      {displayCycle ? (
        <div className="space-y-6">
          {/* Main Operational Hero Dashboard */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">État Global :</span>
                {getStatusBadge(displayCycle.status)}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Démarré : {formatDate(displayCycle.startedAt)}</span>
              </div>
            </div>

            {/* Progression Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[11px] border border-indigo-500/30">
                    Phase {currentPhaseIndex + 1}/10
                  </span>
                  <span>{activePhaseInfo.label} — {activePhaseInfo.description}</span>
                </span>
                <span className="text-indigo-400 font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* 3-Pillar Summary Cards: Action en cours, Problème détecté, Quality Gate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Pillar 1: Action en cours */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Action en Cours
                </span>
                <div className="font-semibold text-slate-100 text-sm">
                  {isRunning ? activePhaseInfo.description : `Cycle ${displayCycle.status.toLowerCase()}`}
                </div>
                <p className="text-slate-400 text-xs">
                  {displayCycle.plan?.title || 'Analyse observationnelle et surveillance continue des régressions.'}
                </p>
                {displayCycle.plan?.verificationCommand && (
                  <div className="pt-1 text-[11px] font-mono text-amber-300 truncate">
                    Commande : {displayCycle.plan.verificationCommand}
                  </div>
                )}
              </div>

              {/* Pillar 2: Problème détecté */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Problème Détecté
                </span>
                {displayCycle.selectedProblem ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100 text-xs truncate">
                        {displayCycle.selectedProblem.title}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          displayCycle.selectedProblem.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300'
                            : displayCycle.selectedProblem.severity === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {displayCycle.selectedProblem.severity}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] line-clamp-2">
                      {displayCycle.selectedProblem.description}
                    </p>
                    {displayCycle.selectedProblem.targetFiles?.length > 0 && (
                      <div className="text-[11px] font-mono text-indigo-300 truncate">
                        Fichiers : {displayCycle.selectedProblem.targetFiles.join(', ')}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-emerald-400 flex items-center gap-1.5 pt-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Aucune anomalie détectée (Système sain).</span>
                  </div>
                )}
              </div>

              {/* Pillar 3: Quality Gate & Résultat Final */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quality Gate & Résultat
                </span>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tests unitaires :</span>
                    {displayCycle.evaluation ? (
                      displayCycle.evaluation.testsPassed ? (
                        <span className="text-emerald-400 font-bold font-mono">✓ PASS</span>
                      ) : (
                        <span className="text-rose-400 font-bold font-mono">✕ FAIL</span>
                      )
                    ) : (
                      <span className="text-slate-500 font-mono">○ PENDING</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Revue & Sécurité :</span>
                    {displayCycle.evaluation ? (
                      displayCycle.evaluation.reviewApproved ? (
                        <span className="text-emerald-400 font-bold font-mono">✓ APPROVED</span>
                      ) : (
                        <span className="text-rose-400 font-bold font-mono">✕ REJECTED</span>
                      )
                    ) : (
                      <span className="text-slate-500 font-mono">○ PENDING</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800 pt-1">
                    <span className="text-slate-300 font-semibold">Autorisation Gate :</span>
                    {displayCycle.evaluation ? (
                      displayCycle.evaluation.gateAuthorized ? (
                        <span className="text-emerald-400 font-bold font-mono">✓ AUTORISÉ</span>
                      ) : (
                        <span className="text-rose-400 font-bold font-mono">✕ REFUSÉ</span>
                      )
                    ) : (
                      <span className="text-slate-500 font-mono">○ PENDING</span>
                    )}
                  </div>
                </div>

                {/* Git Delivery status if any */}
                {displayCycle.gitDelivery?.delivered && (
                  <div className="pt-1 text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                    <GitPullRequest className="w-3.5 h-3.5" /> PR livrée ({displayCycle.gitDelivery.commitSha?.slice(0, 7)})
                  </div>
                )}
              </div>
            </div>

            {/* Actions Bar (Rollback if needed) */}
            {displayCycle.status === 'COMPLETED' && (
              <div className="pt-2 flex justify-end">
                <button
                  id="btn-rollback-cycle"
                  onClick={() => rollbackCycle(displayCycle.id)}
                  disabled={isRollingBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-xs font-semibold rounded-lg border border-slate-800 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isRollingBack ? 'Annulation en cours...' : 'Annuler ce cycle (Rollback)'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Stepper des 10 phases (Secondaire & Repliable) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <button
              type="button"
              onClick={() => setShowFullStepper(!showFullStepper)}
              className="flex items-center justify-between w-full text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              <span className="flex items-center gap-2 uppercase tracking-wider">
                <Layers className="w-4 h-4 text-indigo-400" />
                Pipeline séquentiel des 10 phases d'auto-amélioration
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-mono text-[11px]">
                  {showFullStepper ? 'Masquer détail' : 'Afficher détail'}
                </span>
                {showFullStepper ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showFullStepper && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2">
                {PHASES.map((phase, idx) => {
                  const isCompleted = currentPhaseIndex > idx;
                  const isCurrent = currentPhaseIndex === idx;
                  const isPending = currentPhaseIndex < idx;

                  return (
                    <div
                      key={phase.key}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-between min-h-[90px] ${
                        isCurrent
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30 font-semibold'
                          : isCompleted
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="w-full">
                        <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
                          0{idx + 1}
                        </span>
                        <span className="text-xs font-bold block truncate">
                          {phase.label}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                          {phase.description}
                        </span>
                      </div>
                      <div className="mt-2">
                        {isCurrent ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-mono font-bold">
                            ● RUNNING
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                            ✓ COMPLETED
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 font-mono">
                            ○ PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Logs & Historique */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                Journal d'observabilité & télémétrie de phase
              </h3>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs">
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
                  <div className="text-slate-500 italic">Aucun événement enregistré pour ce cycle.</div>
                )}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Historique des cycles</span>
                <span className="text-xs text-slate-400 font-mono">{cycles.length}</span>
              </h3>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {cycles.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCycleId(c.id)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between cursor-pointer ${
                      (selectedCycleId === c.id || (!selectedCycleId && displayCycle.id === c.id))
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-mono text-[10px] text-slate-500">
                        {formatDate(c.startedAt)}
                      </div>
                      <div className="truncate font-semibold text-slate-200">
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Cpu className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-200">Aucun cycle enregistré</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Cliquez sur "Lancer le cycle autonome" pour débuter l'observation et la détection d'anomalies.
          </p>
        </div>
      )}
    </div>
  );
};
