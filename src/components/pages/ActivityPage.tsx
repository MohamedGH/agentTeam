import React, { useState } from 'react';
import {
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Brain,
  Cpu,
  GitBranch,
  GitPullRequest,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  StatusBadge,
  EmptyState,
} from '../ui';
import { AppRoute } from '../../managers/routeManager';
import { useWorkflowState } from '../../managers/useWorkflowState';
import { useSelfImprovementState } from '../../managers/useSelfImprovementState';
import { useDeliveryState } from '../../managers/useDeliveryState';
import { useJulesState } from '../../managers/useJulesState';

export interface ActivityEntry {
  id: string;
  category: 'Build' | 'CI' | 'Intelligence' | 'System';
  action: string;
  status: 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'IDLE';
  summary: string;
  timeAgo: string;
  route: AppRoute;
  details?: Record<string, any> | string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ActivityPageProps {
  onNavigate: (route: AppRoute, params?: Record<string, string>) => void;
}

export const ActivityPage: React.FC<ActivityPageProps> = ({ onNavigate }) => {
  const workflow = useWorkflowState();
  const selfImprovement = useSelfImprovementState();
  const delivery = useDeliveryState();
  const jules = useJulesState();

  const [statusFilter, setStatusFilter] = useState<'All' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Human Activity Timeline Entries
  const activities: ActivityEntry[] = [];

  // 1. Workflow AgentTeam
  activities.push({
    id: 'act-workflow',
    category: 'Build',
    action:
      workflow.executionState === 'COMPLETED'
        ? '✓ Mission de développement terminée'
        : workflow.executionState === 'RUNNING'
        ? '● Développement de code en cours'
        : workflow.executionState === 'FAILED'
        ? '✕ Échec de validation du code'
        : 'Système en attente de mission',
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
    summary:
      workflow.executionState === 'COMPLETED'
        ? '7 étapes validées : Code développé, tests QA réussis et revue de sécurité approuvée.'
        : workflow.executionState === 'RUNNING'
        ? `Étape ${workflow.currentPhase}/7 en cours d’exécution par l’agent ${workflow.activeAgent || 'Developer'}.`
        : workflow.executionState === 'FAILED'
        ? workflow.errorMessage || 'Le Quality Gate a interrompu le pipeline suite à une anomalie.'
        : 'Aucune exécution en cours.',
    timeAgo: workflow.elapsedSeconds > 0 ? `${workflow.elapsedSeconds.toFixed(1)}s d’exécution` : 'Récent',
    route: 'build',
    icon: Sparkles,
    details: workflow.finalReport || { executionState: workflow.executionState, currentPhase: workflow.currentPhase },
  });

  // 2. GitHub CI Delivery
  activities.push({
    id: 'act-ci',
    category: 'CI',
    action:
      delivery.ciStatus === 'TERMINAL_SUCCESS'
        ? '✓ Livraison GitHub Actions validée'
        : delivery.ciStatus === 'RUNNING'
        ? '● Vérification CI en cours sur GitHub'
        : delivery.ciStatus === 'TERMINAL_FAILURE'
        ? '✕ Échec des tests CI sur GitHub'
        : 'Pipeline GitHub Actions',
    status:
      delivery.ciStatus === 'TERMINAL_SUCCESS'
        ? 'COMPLETED'
        : delivery.ciStatus === 'TERMINAL_FAILURE'
        ? 'FAILED'
        : delivery.ciStatus === 'RUNNING' || delivery.ciStatus === 'QUEUED'
        ? 'RUNNING'
        : 'IDLE',
    summary: delivery.trackedSha
      ? `Commit SHA ${delivery.trackedSha.slice(0, 7)} · ${delivery.jobs.length} jobs exécutés.`
      : 'Aucun commit récemment soumis à la CI.',
    timeAgo: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString() : 'En attente',
    route: 'build',
    icon: GitBranch,
    details: {
      trackedSha: delivery.trackedSha,
      ciStatus: delivery.ciStatus,
      ciConclusion: delivery.ciConclusion,
      jobsCount: delivery.jobs.length,
      pollAttempts: delivery.pollAttempts,
    },
  });

  // 3. Self-Improvement Loop
  activities.push({
    id: 'act-improve',
    category: 'Intelligence',
    action: selfImprovement.isRunning
      ? '● Boucle d’amélioration active'
      : '✓ Boucle d’amélioration prête',
    status: selfImprovement.isRunning
      ? 'RUNNING'
      : selfImprovement.currentCycle?.status === 'COMPLETED'
      ? 'COMPLETED'
      : selfImprovement.currentCycle?.status === 'FAILED'
      ? 'FAILED'
      : 'IDLE',
    summary: selfImprovement.isRunning
      ? `Cycle #${selfImprovement.currentCycle?.id.slice(0, 8) || '1'} en cours d’évaluation hermétique.`
      : `${selfImprovement.cycles.length} cycles historisés · ${selfImprovement.currentCycle?.detectedProblems.length || 0} problèmes analysés.`,
    timeAgo: selfImprovement.lastUpdated ? new Date(selfImprovement.lastUpdated).toLocaleTimeString() : 'Prêt',
    route: 'intelligence',
    icon: Cpu,
    details: {
      activePhase: selfImprovement.activePhase,
      cyclesCount: selfImprovement.cycles.length,
      currentCycle: selfImprovement.currentCycle,
    },
  });

  // 4. Google Jules Autonomous Session
  activities.push({
    id: 'act-jules',
    category: 'Intelligence',
    action: jules.activeSession
      ? `● Agent Cloud Google Jules (${jules.activeSession.state})`
      : '✓ Agent Cloud Google Jules disponible',
    status: jules.isStartingSession
      ? 'RUNNING'
      : jules.activeSession?.state === 'COMPLETED'
      ? 'COMPLETED'
      : jules.activeSession?.state === 'FAILED'
      ? 'FAILED'
      : 'IDLE',
    summary: jules.activeSession
      ? `Session active ${jules.activeSession.id.slice(0, 10)}.`
      : 'Prêt pour la délégation autonome sur dépôt GitHub.',
    timeAgo: jules.activeSession ? 'Actif' : 'Prêt',
    route: 'intelligence',
    icon: GitPullRequest,
    details: jules.activeSession || { status: 'No active session' },
  });

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    if (statusFilter !== 'All') {
      if (statusFilter === 'RUNNING' && act.status !== 'RUNNING' && act.status !== 'QUEUED') return false;
      if (statusFilter === 'COMPLETED' && act.status !== 'COMPLETED') return false;
      if (statusFilter === 'FAILED' && act.status !== 'FAILED') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        act.action.toLowerCase().includes(q) ||
        act.summary.toLowerCase().includes(q) ||
        act.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyDetails = (id: string, details: any) => {
    navigator.clipboard.writeText(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. VIEW HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Historique d'Activité</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Historique des actions, des validations de tests et des livraisons GitHub.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une action..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 2. SIMPLE 4-STATE FILTERS (Tous | En cours | Réussis | Problèmes) */}
      <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs self-start">
        {[
          { id: 'All', label: 'Tous' },
          { id: 'RUNNING', label: 'En cours' },
          { id: 'COMPLETED', label: 'Réussis' },
          { id: 'FAILED', label: 'Problèmes' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              statusFilter === tab.id
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. TIMELINE ENTRIES */}
      <div className="space-y-3">
        {filteredActivities.length > 0 ? (
          filteredActivities.map((act) => {
            const Icon = act.icon;
            const isExpanded = expandedId === act.id;

            return (
              <div
                key={act.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition shadow-md space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 shrink-0 mt-0.5 sm:mt-0">
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-100">{act.action}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{act.summary}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="text-[11px] font-mono text-slate-500 mr-1">{act.timeAgo}</span>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : act.id)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1"
                    >
                      <span>Détails</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-mono">Détails techniques :</span>
                      <div className="flex items-center gap-2">
                        {act.details && (
                          <button
                            type="button"
                            onClick={() => handleCopyDetails(act.id, act.details)}
                            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {copiedId === act.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedId === act.id ? 'Copié' : 'Copier'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onNavigate(act.route)}
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                        >
                          <span>Voir dans {act.category}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
                      {typeof act.details === 'string'
                        ? act.details
                        : JSON.stringify(act.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <EmptyState
            title="Aucune activité trouvée"
            description="Aucune entrée ne correspond au filtre sélectionné. Réinitialisez les filtres pour voir l'ensemble des activités."
            actionButton={
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('All');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Afficher toutes les activités
              </button>
            }
          />
        )}
      </div>
    </div>
  );
};
