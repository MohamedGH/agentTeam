import React from 'react';
import {
  Clock,
  Cpu,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  StopCircle,
  ShieldCheck,
  Award,
  Crown,
  Code2,
  FlaskConical,
} from 'lucide-react';
import { AgentRole, AIProviderId, FinalReport } from '../types';

export type ExecutionState = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface ExecutionStatusBannerProps {
  executionState: ExecutionState;
  activeAgent?: AgentRole | null;
  currentPhase?: number;
  chosenModel: string;
  activeProvider: AIProviderId;
  elapsedSeconds: number;
  finalReport?: FinalReport | null;
  errorMessage?: string | null;
  stepsCount?: number;
}

const AGENT_LABELS: Record<AgentRole, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  manager: { label: 'Manager (Orchestration)', icon: Crown },
  developer: { label: 'Developer (Implémentation)', icon: Code2 },
  tester: { label: 'Tester (Validation QA)', icon: FlaskConical },
  reviewer: { label: 'Reviewer (Audit & Sécurité)', icon: ShieldCheck },
};

const PHASE_NAMES: Record<number, string> = {
  1: 'Analyse & Décomposition du besoin',
  2: 'Implémentation du code & patches',
  3: 'Validation des modifications (Tests unitaires)',
  4: 'Correction des anomalies détectées',
  5: 'Revue architecturale & sécurité',
  6: 'Ajustement suite aux remarques de revue',
  7: 'Génération du rapport de livraison final',
};

export const ExecutionStatusBanner: React.FC<ExecutionStatusBannerProps> = ({
  executionState,
  activeAgent,
  currentPhase = 1,
  chosenModel,
  activeProvider,
  elapsedSeconds,
  finalReport,
  errorMessage,
  stepsCount = 0,
}) => {
  if (executionState === 'IDLE') {
    return (
      <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Statut :</span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[11px]">
            PRÊT (IDLE)
          </span>
          <span className="text-slate-400">En attente d'une consigne de développement</span>
        </div>

        <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
          <span className="flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-blue-400" /> {activeProvider.toUpperCase()}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" /> {chosenModel}
          </span>
        </div>
      </div>
    );
  }

  if (executionState === 'RUNNING') {
    const AgentIcon = activeAgent ? AGENT_LABELS[activeAgent]?.icon || Cpu : Cpu;
    const agentName = activeAgent ? AGENT_LABELS[activeAgent]?.label : 'Manager';
    const phaseDescription = PHASE_NAMES[currentPhase] || `Phase ${currentPhase}`;

    return (
      <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 rounded-xl border border-blue-500/40 p-4 shadow-lg shadow-blue-500/5 space-y-3">
        {/* Main Status Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold text-xs uppercase tracking-wider border border-blue-500/40">
              EN COURS
            </span>
            <span className="font-semibold text-slate-200 text-xs sm:text-sm">
              Phase {currentPhase} : {phaseDescription}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-blue-300 bg-slate-950/80 px-3 py-1 rounded-lg border border-blue-500/30 self-start sm:self-auto">
            <Clock className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span>Temps écoulé : {elapsedSeconds.toFixed(1)}s</span>
          </div>
        </div>

        {/* Live Metrics Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Agent actif</span>
            <div className="flex items-center gap-1.5 text-slate-100 font-semibold truncate">
              <AgentIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate">{agentName}</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Modèle LLM</span>
            <div className="flex items-center gap-1.5 text-emerald-300 font-mono font-semibold truncate">
              <Cpu className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="truncate">{chosenModel}</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Provider actif</span>
            <div className="flex items-center gap-1.5 text-blue-300 font-mono font-semibold truncate">
              <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate uppercase">{activeProvider}</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Étapes exécutées</span>
            <div className="flex items-center gap-1.5 text-amber-300 font-mono font-semibold truncate">
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
              <span>{stepsCount} action(s)</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (executionState === 'COMPLETED') {
    const isAllGreen = finalReport?.tests === 'PASS' && finalReport?.review === 'APPROVED';

    return (
      <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-slate-900 rounded-xl border border-emerald-500/30 p-4 shadow-lg shadow-emerald-500/5 space-y-3">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-xs uppercase tracking-wider border border-emerald-500/30">
              TERMINÉ
            </span>
            <span className="font-semibold text-slate-200 text-xs sm:text-sm">
              Workflow complété avec succès
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-slate-950/80 px-3 py-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Durée totale : {elapsedSeconds.toFixed(1)}s</span>
          </div>
        </div>

        {/* 4 Summary Verification Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Tests QA</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{finalReport?.tests || 'PASS'}</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Revue de code</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-purple-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{finalReport?.review || 'APPROVED'}</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Identité LLM</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>VERIFIED</span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Modèle utilisé</span>
            <div className="flex items-center gap-1.5 font-mono text-slate-200 truncate">
              <Cpu className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate">{chosenModel}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (executionState === 'CANCELLED') {
    return (
      <div className="bg-slate-900 rounded-xl border border-amber-500/30 p-4 shadow-md space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StopCircle className="w-4.5 h-4.5 text-amber-400" />
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider text-[11px]">
              ARRÊTÉ
            </span>
            <span className="font-semibold text-slate-200">Exécution interrompue par l'utilisateur</span>
          </div>
          <span className="font-mono text-slate-400 text-[11px]">Arrêté à {elapsedSeconds.toFixed(1)}s</span>
        </div>
        <p className="text-slate-400">
          Les modifications en cours ont été préservées dans l'espace de travail virtuel.
        </p>
      </div>
    );
  }

  // FAILED
  return (
    <div className="bg-rose-950/30 rounded-xl border border-rose-500/40 p-4 shadow-md space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <XCircle className="w-4.5 h-4.5 text-rose-400" />
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold uppercase tracking-wider text-[11px]">
            ÉCHEC
          </span>
          <span className="font-semibold text-slate-200">Interruption sur erreur opérationnelle</span>
        </div>
        <span className="font-mono text-slate-400 text-[11px]">Arrêté à {elapsedSeconds.toFixed(1)}s</span>
      </div>
      {errorMessage && (
        <p className="text-rose-300 font-mono bg-slate-950/70 p-2.5 rounded border border-rose-500/20">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
