import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Square,
} from 'lucide-react';
import { AppRoute } from '../managers/routeManager';
import { useWorkflowState } from '../managers/useWorkflowState';
import { useSelfImprovementState } from '../managers/useSelfImprovementState';
import { useDeliveryState } from '../managers/useDeliveryState';
import { useJulesState } from '../managers/useJulesState';
import { apiFetch } from '../utils/apiFetch';

export interface ActivityItem {
  id: string;
  category: string;
  name: string;
  status: 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK' | 'HALTED_GATE' | 'NOT_FOUND' | 'IDLE' | 'UNKNOWN';
  progressText?: string;
  detailText?: string;
  duration?: string;
  route: AppRoute;
  icon: React.ComponentType<{ className?: string }>;
}

interface GlobalActivityCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: AppRoute) => void;
}

export const GlobalActivityCenter: React.FC<GlobalActivityCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  // Single sources of truth from state managers
  const workflow = useWorkflowState();
  const selfImprovement = useSelfImprovementState();
  const delivery = useDeliveryState();
  const jules = useJulesState();

  const [operationalDecision, setOperationalDecision] = useState<any | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiFetch('/api/llm/last-operational-decision')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && d.decision) {
          setOperationalDecision(d.decision);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Update sync elapsed time every second
  useEffect(() => {
    if (!isOpen) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, delivery.updatedAt]);

  // 1. Workflow AgentTeam Activity Item
  const workflowItem: ActivityItem = {
    id: 'agent-workflow',
    category: 'BUILD',
    name: 'Workflow AgentTeam',
    status:
      workflow.executionState === 'RUNNING'
        ? 'RUNNING'
        : workflow.executionState === 'COMPLETED'
        ? 'COMPLETED'
        : workflow.executionState === 'FAILED'
        ? 'FAILED'
        : workflow.executionState === 'CANCELLED'
        ? 'CANCELLED'
        : 'IDLE',
    progressText:
      workflow.executionState === 'RUNNING'
        ? `Phase ${workflow.currentPhase}/7 (${workflow.activeAgent || 'manager'})`
        : workflow.executionState === 'COMPLETED'
        ? '7/7 phases validées'
        : undefined,
    duration:
      workflow.elapsedSeconds > 0
        ? `${workflow.elapsedSeconds.toFixed(1)}s`
        : undefined,
    detailText:
      workflow.executionState === 'COMPLETED'
        ? `Tests : ${workflow.finalReport?.tests || 'N/A'} · Review : ${workflow.finalReport?.review || 'N/A'}`
        : workflow.executionState === 'FAILED'
        ? workflow.errorMessage || 'Erreur d’exécution'
        : workflow.executionState === 'CANCELLED'
        ? 'Exécution arrêtée par l’utilisateur'
        : `Modèle : ${workflow.chosenModel} (${workflow.activeProvider.toUpperCase()})`,
    route: 'studio',
    icon: Sparkles,
  };

  // 2. Self-Improvement Loop Activity Item
  const selfImprovementItem: ActivityItem = (() => {
    if (selfImprovement.isRunning) {
      return {
        id: 'self-improvement',
        category: 'INTELLIGENCE',
        name: 'Self-Improvement Autonomous Loop',
        status: 'RUNNING',
        progressText: `Phase ${selfImprovement.currentCycle?.currentPhase || selfImprovement.activePhase || 'OBSERVE'}`,
        detailText: `Cycle #${selfImprovement.currentCycle?.id ? selfImprovement.currentCycle.id.slice(0, 8) : '1'} en cours`,
        route: 'auto-improve',
        icon: Cpu,
      };
    }
    if (selfImprovement.currentCycle) {
      const cycle = selfImprovement.currentCycle;
      const status: ActivityItem['status'] =
        cycle.status === 'COMPLETED'
          ? 'COMPLETED'
          : cycle.status === 'ROLLED_BACK'
          ? 'ROLLED_BACK'
          : cycle.status === 'FAILED'
          ? 'FAILED'
          : cycle.status === 'HALTED_GATE'
          ? 'HALTED_GATE'
          : cycle.status === 'RUNNING'
          ? 'RUNNING'
          : cycle.status === 'IDLE'
          ? 'IDLE'
          : 'UNKNOWN';

      return {
        id: 'self-improvement',
        category: 'INTELLIGENCE',
        name: 'Self-Improvement Autonomous Loop',
        status,
        progressText: `Cycle #${cycle.id.slice(0, 8)}`,
        detailText:
          cycle.evaluation?.summary ||
          (cycle.verifiedFixed ? 'Problème corrigé & vérifié' : `Cycle terminé : ${cycle.status}`),
        route: 'auto-improve',
        icon: Cpu,
      };
    }
    return {
      id: 'self-improvement',
      category: 'INTELLIGENCE',
      name: 'Self-Improvement Autonomous Loop',
      status: 'IDLE',
      detailText: 'Boucle continue d’auto-guérison logicielle en 10 étapes',
      route: 'auto-improve',
      icon: Cpu,
    };
  })();

  // 3. Git Delivery (Push) Activity Item
  const gitPushItem: ActivityItem = (() => {
    if (delivery.pushStatus === 'RUNNING') {
      return {
        id: 'git-push',
        category: 'DELIVERY',
        name: 'Git Delivery (Push)',
        status: 'RUNNING',
        progressText: 'Push en cours',
        detailText: `Envoi vers ${delivery.repository} sur ${delivery.branch}...`,
        route: 'github-settings',
        icon: GitBranch,
      };
    }
    if (delivery.pushStatus === 'COMPLETED') {
      return {
        id: 'git-push',
        category: 'DELIVERY',
        name: 'Git Delivery (Push)',
        status: 'COMPLETED',
        progressText: delivery.commitSha ? `Commit ${delivery.commitSha.slice(0, 7)}` : 'Validé',
        detailText: delivery.commitSha
          ? `Push terminé · Commit ${delivery.commitSha.slice(0, 7)} sur ${delivery.branch}`
          : `Push terminé sur ${delivery.branch}`,
        route: 'github-settings',
        icon: GitBranch,
      };
    }
    if (delivery.pushStatus === 'FAILED') {
      return {
        id: 'git-push',
        category: 'DELIVERY',
        name: 'Git Delivery (Push)',
        status: 'FAILED',
        detailText: delivery.pushError || 'Échec du push Git',
        route: 'github-settings',
        icon: GitBranch,
      };
    }
    return {
      id: 'git-push',
      category: 'DELIVERY',
      name: 'Git Delivery (Push)',
      status: 'IDLE',
      detailText: `Prêt pour push vers ${delivery.repository} (${delivery.branch})`,
      route: 'github-settings',
      icon: GitBranch,
    };
  })();

  // 4. GitHub Actions (CI) Activity Item (Strict trackedSha correlation, zero cross-SHA display)
  const ciWorkflowItem: ActivityItem = (() => {
    if (delivery.trackedSha) {
      const isMatched = Boolean(delivery.ciRun && delivery.ciRun.head_sha === delivery.trackedSha);

      if (isMatched && delivery.ciRun) {
        if (
          delivery.ciStatus === 'COMPLETED' ||
          delivery.ciStatus === 'TERMINAL_SUCCESS' ||
          delivery.ciStatus === 'TERMINAL_FAILURE'
        ) {
          const isSuccess = delivery.ciStatus === 'TERMINAL_SUCCESS' || delivery.ciConclusion === 'success';
          return {
            id: 'ci-workflow',
            category: 'DELIVERY',
            name: 'GitHub CI Actions',
            status: isSuccess ? 'COMPLETED' : 'FAILED',
            progressText: `Run #${delivery.ciRun.id} · ${delivery.trackedSha.slice(0, 7)}`,
            detailText: `CI ${isSuccess ? 'réussie' : 'échouée'} (${delivery.ciConclusion || 'completed'}) · ${delivery.ciRun.name || 'Pipeline'}${delivery.jobs?.[0] ? ` · Job: ${delivery.jobs[0].name}` : ''}`,
            route: 'github-settings',
            icon: Layers,
          };
        }
        if (delivery.ciStatus === 'RUNNING') {
          return {
            id: 'ci-workflow',
            category: 'DELIVERY',
            name: 'GitHub CI Actions',
            status: 'RUNNING',
            progressText: `Run #${delivery.ciRun.id} · ${delivery.trackedSha.slice(0, 7)}`,
            detailText: delivery.jobs?.[0] ? `Job: ${delivery.jobs[0].name} (${delivery.jobs[0].status})` : 'Workflow détecté — démarrage…',
            route: 'github-settings',
            icon: Layers,
          };
        }
        // QUEUED or WAITING_WORKFLOW
        return {
          id: 'ci-workflow',
          category: 'DELIVERY',
          name: 'GitHub CI Actions',
          status: 'QUEUED',
          progressText: `Run #${delivery.ciRun.id} · ${delivery.trackedSha.slice(0, 7)}`,
          detailText: 'Workflow détecté — démarrage…',
          route: 'github-settings',
          icon: Layers,
        };
      }

      if (
        delivery.ciStatus === 'NOT_FOUND' ||
        delivery.ciStatus === 'RUN_NOT_FOUND_FOR_SHA' ||
        delivery.ciStatus === 'POLLING_FAILED_TIMEOUT'
      ) {
        return {
          id: 'ci-workflow',
          category: 'DELIVERY',
          name: 'GitHub CI Actions',
          status: 'NOT_FOUND',
          progressText: delivery.trackedSha.slice(0, 7),
          detailText: `CI non détectée pour ce commit (${delivery.pollAttempts} tentatives)`,
          route: 'github-settings',
          icon: Layers,
        };
      }

      if (delivery.ciStatus === 'POLLING_FAILED_NETWORK') {
        return {
          id: 'ci-workflow',
          category: 'DELIVERY',
          name: 'GitHub CI Actions',
          status: 'FAILED',
          progressText: delivery.trackedSha.slice(0, 7),
          detailText: `Erreur réseau lors de la vérification CI (${delivery.pollAttempts}/20)`,
          route: 'github-settings',
          icon: Layers,
        };
      }

      // Waiting for workflow creation
      return {
        id: 'ci-workflow',
        category: 'DELIVERY',
        name: 'GitHub CI Actions',
        status: 'QUEUED',
        progressText: delivery.trackedSha.slice(0, 7),
        detailText: `En attente du workflow GitHub… (tentative ${delivery.pollAttempts}/20)`,
        route: 'github-settings',
        icon: Layers,
      };
    }

    return {
      id: 'ci-workflow',
      category: 'DELIVERY',
      name: 'GitHub CI Actions',
      status: 'IDLE',
      detailText: 'En attente d’un commit suivi (trackedSha) pour vérification CI',
      route: 'github-settings',
      icon: Layers,
    };
  })();

  // 5. Google Jules Cloud Agent Activity Item (Never mark terminal sessions as RUNNING)
  const julesState = jules.activeSession?.state;
  const isJulesTerminal = Boolean(
    julesState && ['COMPLETED', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(julesState)
  );
  const isJulesActive =
    !isJulesTerminal &&
    (jules.isStartingSession ||
      Boolean(julesState && ['IN_PROGRESS', 'QUEUED', 'PLANNING', 'AWAITING_PLAN_APPROVAL'].includes(julesState)));

  const julesItem: ActivityItem = (() => {
    if (isJulesActive) {
      return {
        id: 'jules-agent',
        category: 'BUILD',
        name: 'Google Jules Coding Agent',
        status: julesState === 'QUEUED' ? 'QUEUED' : 'RUNNING',
        progressText: jules.activeSession?.id ? `Session #${jules.activeSession.id.slice(0, 8)}` : undefined,
        detailText: `Activité : ${jules.activities[jules.activities.length - 1]?.description || 'En cours d’exécution'}`,
        route: 'jules',
        icon: GitPullRequest,
      };
    }
    if (jules.activeSession && (jules.activeSession.state === 'COMPLETED' || jules.activeSession.state === 'SUCCEEDED')) {
      return {
        id: 'jules-agent',
        category: 'BUILD',
        name: 'Google Jules Coding Agent',
        status: 'COMPLETED',
        progressText: jules.activeSession.prUrl ? 'PR GitHub créée' : 'Terminé',
        detailText: jules.activeSession.prUrl ? `PR : ${jules.activeSession.prUrl}` : 'Tâche terminée avec succès',
        route: 'jules',
        icon: GitPullRequest,
      };
    }
    if (jules.activeSession && jules.activeSession.state === 'CANCELLED') {
      return {
        id: 'jules-agent',
        category: 'BUILD',
        name: 'Google Jules Coding Agent',
        status: 'CANCELLED',
        detailText: 'Session annulée',
        route: 'jules',
        icon: GitPullRequest,
      };
    }
    if (jules.activeSession && jules.activeSession.state === 'FAILED') {
      return {
        id: 'jules-agent',
        category: 'BUILD',
        name: 'Google Jules Coding Agent',
        status: 'FAILED',
        detailText: jules.error?.message || jules.activeSession.resultSummary || 'Session interrompue',
        route: 'jules',
        icon: GitPullRequest,
      };
    }
    if (jules.error) {
      return {
        id: 'jules-agent',
        category: 'BUILD',
        name: 'Google Jules Coding Agent',
        status: 'FAILED',
        detailText: jules.error.message || 'Erreur Jules',
        route: 'jules',
        icon: GitPullRequest,
      };
    }
    return {
      id: 'jules-agent',
      category: 'BUILD',
      name: 'Google Jules Coding Agent',
      status: 'IDLE',
      detailText: 'Délégation cloud asynchrone et PR GitHub',
      route: 'jules',
      icon: GitPullRequest,
    };
  })();

  // 6. Adaptive Multi-LLM Routing Activity Item (Historical decision is IDLE unless an active workflow is currently routing)
  const adaptiveItem: ActivityItem =
    workflow.executionState === 'RUNNING'
      ? {
          id: 'adaptive-routing',
          category: 'INTELLIGENCE',
          name: 'Routage Adaptatif Multi-LLM',
          status: 'RUNNING',
          progressText: operationalDecision?.selectedModelId || workflow.chosenModel,
          detailText: `Routage actif pour l’exécution en cours`,
          route: 'adaptive-llm',
          icon: Brain,
        }
      : {
          id: 'adaptive-routing',
          category: 'INTELLIGENCE',
          name: 'Routage Adaptatif & Benchmarks',
          status: 'IDLE',
          progressText: operationalDecision?.selectedModelId,
          detailText: operationalDecision
            ? `Dernière décision historique : ${operationalDecision.selectedModelId} (${operationalDecision.decisionType})`
            : 'Sélection bayésienne sous contraintes strictes',
          route: 'adaptive-llm',
          icon: Brain,
        };

  const allActivities: ActivityItem[] = [
    workflowItem,
    ciWorkflowItem,
    selfImprovementItem,
    gitPushItem,
    julesItem,
    adaptiveItem,
  ];

  // UX Hierarchy: 1. EN COURS -> 2. TERMINÉES -> 3. INACTIVES
  const activeItems = allActivities.filter((a) => a.status === 'RUNNING' || a.status === 'QUEUED');
  const completedItems = allActivities.filter((a) =>
    ['COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK', 'HALTED_GATE', 'NOT_FOUND'].includes(a.status)
  );
  const inactiveItems = allActivities.filter((a) => ['IDLE', 'UNKNOWN'].includes(a.status));

  const renderBadge = (status: ActivityItem['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            RUNNING
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
            QUEUED
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            COMPLETED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3 text-rose-400" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <Square className="w-2.5 h-2.5 fill-slate-400 text-slate-400" />
            CANCELLED
          </span>
        );
      case 'ROLLED_BACK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <RotateCcw className="w-3 h-3 text-amber-400" />
            ROLLED BACK
          </span>
        );
      case 'HALTED_GATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <AlertTriangle className="w-3 h-3 text-purple-400" />
            HALTED GATE
          </span>
        );
      case 'NOT_FOUND':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            NOT FOUND
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3 h-3 text-slate-500" />
            UNKNOWN
          </span>
        );
      case 'IDLE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/80">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            IDLE
          </span>
        );
    }
  };

  const renderActivityCard = (item: ActivityItem) => {
    const Icon = item.icon;
    return (
      <div
        key={item.id}
        tabIndex={0}
        role="button"
        onClick={() => {
          onNavigate(item.route);
          onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate(item.route);
            onClose();
          }
        }}
        className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer group focus:outline-none focus:border-blue-500"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 group-hover:text-blue-400 group-hover:border-slate-700 transition mt-0.5 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                [{item.category}]
              </span>
              <strong className="text-xs text-slate-100 font-semibold group-hover:text-white transition">
                {item.name}
              </strong>
              {item.progressText && (
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">
                  {item.progressText}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 truncate">{item.detailText}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
          {item.duration && (
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              <Clock className="w-3 h-3 text-slate-500" />
              {item.duration}
            </span>
          )}
          {renderBadge(item.status)}
          <span
            className="p-1.5 rounded-lg bg-slate-900 group-hover:bg-slate-800 text-slate-400 group-hover:text-white border border-slate-800 transition"
            title={`Accéder à ${item.name}`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-center-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
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
                <h2 id="activity-center-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Centre d'Activités & Opérations Globales
                </h2>
                {activeItems.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30 animate-pulse">
                    {activeItems.length} en cours
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Vue centralisée hiérarchisée : opérations actives, terminées et inactives.
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

        {/* Activity List with 3-Level Hierarchy */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Section 1: EN COURS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
                EN COURS ({activeItems.length})
              </span>
            </div>
            {activeItems.length > 0 ? (
              <div className="space-y-2">{activeItems.map(renderActivityCard)}</div>
            ) : (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 text-center text-xs text-slate-500">
                Aucune opération active en cours d'exécution
              </div>
            )}
          </div>

          {/* Section 2: TERMINÉES */}
          {completedItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                TERMINÉES ({completedItems.length})
              </span>
              <div className="space-y-2">{completedItems.map(renderActivityCard)}</div>
            </div>
          )}

          {/* Section 3: INACTIVES */}
          {inactiveItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                INACTIVES ({inactiveItems.length})
              </span>
              <div className="space-y-2">{inactiveItems.map(renderActivityCard)}</div>
            </div>
          )}
        </div>

        {/* Footer info (Requirement 10: faithful message + sync timer) */}
        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            États synchronisés avec les services actifs · <span className="text-slate-500 font-mono">Dernière actualisation : {secondsAgo}s</span>
          </span>
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
