import React from 'react';
import {
  Activity,
  X,
  ArrowRight,
  Sparkles,
  Brain,
  Cpu,
  GitBranch,
  Layers,
  GitPullRequest,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { StatusBadge, AppStatus } from './ui';
import { AppRoute } from '../managers/routeManager';
import { WorkflowState } from '../managers/workflowStateManager';

export interface ActivityItem {
  id: string;
  category: string;
  name: string;
  status: AppStatus | string;
  progressText?: string;
  detailText?: string;
  timestamp?: string | number;
  duration?: string;
  route: AppRoute;
  icon: React.ComponentType<{ className?: string }>;
}

interface GlobalActivityCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: AppRoute) => void;
  workflowState: WorkflowState;
  selfImprovementState?: {
    isRunning: boolean;
    currentCycle?: {
      status: string;
      currentPhase?: string;
      startedAt?: string;
    } | null;
  };
  latestPush?: {
    commitSha?: string;
    branch?: string;
    date?: string;
  } | null;
  ciStatus?: {
    status?: string;
    conclusion?: string;
    id?: number;
    head_sha?: string;
  } | null;
}

export const GlobalActivityCenter: React.FC<GlobalActivityCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
  workflowState,
  selfImprovementState,
  latestPush,
  ciStatus,
}) => {
  if (!isOpen) return null;

  // Build real-time activity entries from existing system states
  const activities: ActivityItem[] = [
    // 1. Workflow AgentTeam
    {
      id: 'agent-workflow',
      category: 'BUILD',
      name: 'Workflow AgentTeam',
      status: workflowState.executionState,
      progressText:
        workflowState.executionState === 'RUNNING'
          ? `Phase ${workflowState.currentPhase}/7 (${workflowState.activeAgent || 'manager'})`
          : undefined,
      duration:
        workflowState.elapsedSeconds > 0
          ? `${workflowState.elapsedSeconds.toFixed(1)}s`
          : undefined,
      detailText:
        workflowState.executionState === 'COMPLETED'
          ? `Tests: ${workflowState.finalReport?.tests || 'PASS'} · Review: ${workflowState.finalReport?.review || 'APPROVED'}`
          : workflowState.executionState === 'FAILED'
          ? workflowState.errorMessage || 'Erreur d’exécution'
          : `Modèle : ${workflowState.chosenModel} (${workflowState.activeProvider.toUpperCase()})`,
      route: 'studio',
      icon: Sparkles,
    },

    // 2. Self-Improvement Loop
    {
      id: 'self-improvement',
      category: 'INTELLIGENCE',
      name: 'Self-Improvement Autonomous Loop',
      status: selfImprovementState?.isRunning
        ? 'RUNNING'
        : selfImprovementState?.currentCycle?.status || 'IDLE',
      progressText: selfImprovementState?.currentCycle?.currentPhase
        ? `Phase : ${selfImprovementState.currentCycle.currentPhase}`
        : undefined,
      detailText: 'Boucle d’auto-guérison et détection des régressions',
      route: 'auto-improve',
      icon: Cpu,
    },

    // 3. Adaptive LLM Routing
    {
      id: 'adaptive-routing',
      category: 'INTELLIGENCE',
      name: 'Routage Adaptatif & Benchmarks',
      status: 'IDLE',
      detailText: 'Sélection bayésienne sous contraintes strictes',
      route: 'adaptive-llm',
      icon: Brain,
    },

    // 4. Google Jules Cloud Agent
    {
      id: 'jules-agent',
      category: 'BUILD',
      name: 'Google Jules Coding Agent',
      status: 'IDLE',
      detailText: 'Délégation cloud asynchrone et PR GitHub',
      route: 'jules',
      icon: GitPullRequest,
    },

    // 5. Git Push
    {
      id: 'git-push',
      category: 'SYSTEM',
      name: 'Git Delivery (MohamedGH/agentTeam)',
      status: latestPush?.commitSha ? 'COMPLETED' : 'IDLE',
      detailText: latestPush?.commitSha
        ? `Commit ${latestPush.commitSha.slice(0, 7)} sur ${latestPush.branch || 'main'}`
        : 'Prêt pour push vers branche main',
      route: 'github-settings',
      icon: GitBranch,
    },

    // 6. CI GitHub Actions
    {
      id: 'ci-workflow',
      category: 'SYSTEM',
      name: 'CI GitHub Actions',
      status: ciStatus
        ? ciStatus.conclusion === 'success'
          ? 'COMPLETED'
          : ciStatus.status === 'completed'
          ? 'FAILED'
          : 'RUNNING'
        : 'IDLE',
      progressText: ciStatus?.id ? `Run #${ciStatus.id}` : undefined,
      detailText: ciStatus?.head_sha
        ? `SHA : ${ciStatus.head_sha.slice(0, 7)}`
        : 'Surveillance des builds et tests distants',
      route: 'github-settings',
      icon: Layers,
    },
  ];

  const runningCount = activities.filter((a) => a.status === 'RUNNING').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-center-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="activity-center-title" className="text-base font-bold text-white tracking-tight">
                  Centre d'Activités & Opérations Globales
                </h2>
                {runningCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30 animate-pulse">
                    {runningCount} en cours
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Vue centralisée des processus actifs, durées et statuts de l'écosystème agentTeam.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le centre d'activités"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {activities.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                        [{item.category}]
                      </span>
                      <strong className="text-xs text-slate-100 font-semibold">{item.name}</strong>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.detailText}</p>
                    {item.progressText && (
                      <span className="text-[10px] font-mono text-indigo-300 block mt-0.5">
                        {item.progressText}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                  {item.duration && (
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {item.duration}
                    </span>
                  )}
                  <StatusBadge status={item.status} size="sm" />
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(item.route);
                      onClose();
                    }}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
                    title={`Accéder à ${item.name}`}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Actualisation continue en temps réel</span>
          <button
            type="button"
            onClick={onClose}
            className="text-blue-400 hover:text-blue-300 text-xs font-semibold cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
