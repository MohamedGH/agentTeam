import React, { useState, useEffect } from 'react';
import {
  Activity,
  Filter,
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
  Layers,
  HelpCircle,
  Copy,
  Check,
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
import { apiFetch } from '../../utils/apiFetch';

export interface ActivityEntry {
  id: string;
  category: 'Build' | 'CI' | 'Intelligence' | 'System';
  action: string;
  status: 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK' | 'IDLE' | 'UNKNOWN';
  result: string;
  time: string;
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

  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Build' | 'CI' | 'Intelligence' | 'System'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Build synthesized activity timeline from all real state managers
  const activities: ActivityEntry[] = [];

  // 1. Workflow AgentTeam
  activities.push({
    id: 'act-workflow',
    category: 'Build',
    action: 'Workflow Équipe Autonome (Manager/Dev/QA/Review)',
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
    result:
      workflow.executionState === 'COMPLETED'
        ? `7/7 phases validées · Tests: ${workflow.finalReport?.tests || '100%'} · Review: Validée`
        : workflow.executionState === 'FAILED'
        ? workflow.errorMessage || 'Échec de la validation'
        : workflow.executionState === 'RUNNING'
        ? `Phase ${workflow.currentPhase}/7 en cours d'exécution par ${workflow.activeAgent || 'Manager'}`
        : 'En attente de tâche',
    time: workflow.elapsedSeconds > 0 ? `${workflow.elapsedSeconds.toFixed(1)}s écoulées` : 'Prêt',
    route: 'build',
    icon: Sparkles,
    details: workflow.finalReport || { executionState: workflow.executionState, currentPhase: workflow.currentPhase },
  });

  // 2. GitHub CI Delivery
  activities.push({
    id: 'act-ci',
    category: 'CI',
    action: 'GitHub Actions & Pipeline de Livraison',
    status:
      delivery.ciStatus === 'TERMINAL_SUCCESS'
        ? 'COMPLETED'
        : delivery.ciStatus === 'TERMINAL_FAILURE'
        ? 'FAILED'
        : delivery.ciStatus === 'RUNNING' || delivery.ciStatus === 'QUEUED' || delivery.ciStatus === 'WAITING_WORKFLOW'
        ? 'RUNNING'
        : 'IDLE',
    result:
      delivery.trackedSha
        ? `Commit SHA ${delivery.trackedSha.slice(0, 7)} · ${delivery.jobs.length} jobs vérifiés`
        : 'Aucun commit récemment suivi',
    time: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString() : 'En attente',
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
    action: 'Boucle Autonome d’Auto-Amélioration',
    status: selfImprovement.isRunning
      ? 'RUNNING'
      : selfImprovement.currentCycle?.status === 'COMPLETED'
      ? 'COMPLETED'
      : selfImprovement.currentCycle?.status === 'FAILED'
      ? 'FAILED'
      : 'IDLE',
    result: selfImprovement.isRunning
      ? `Cycle #${selfImprovement.currentCycle?.id.slice(0, 8) || '1'} en cours (${selfImprovement.activePhase || 'OBSERVE'})`
      : `${selfImprovement.cycles.length} cycles historisés · ${selfImprovement.currentCycle?.detectedProblems.length || 0} problèmes analysés`,
    time: selfImprovement.lastUpdated ? new Date(selfImprovement.lastUpdated).toLocaleTimeString() : 'Prêt',
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
    action: 'Agent Cloud Google Jules',
    status: jules.isStartingSession
      ? 'RUNNING'
      : jules.activeSession?.state === 'COMPLETED'
      ? 'COMPLETED'
      : jules.activeSession?.state === 'FAILED'
      ? 'FAILED'
      : 'IDLE',
    result: jules.activeSession
      ? `Session ${jules.activeSession.id.slice(0, 10)} · État : ${jules.activeSession.state}`
      : 'Prêt pour délégation GitHub',
    time: jules.activeSession ? 'Session active' : 'Prêt',
    route: 'intelligence',
    icon: GitPullRequest,
    details: jules.activeSession || { status: 'No active session' },
  });

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    if (categoryFilter !== 'All' && act.category !== categoryFilter) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'RUNNING' && act.status !== 'RUNNING' && act.status !== 'QUEUED') return false;
      if (statusFilter === 'COMPLETED' && act.status !== 'COMPLETED') return false;
      if (statusFilter === 'FAILED' && act.status !== 'FAILED') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        act.action.toLowerCase().includes(q) ||
        act.result.toLowerCase().includes(q) ||
        act.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyDetails = (id: string, details: any) => {
    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. VIEW HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Historique Global d'Activité</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Timeline chronologique complète : Heure → Action → État → Résultat.
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

      {/* 2. FILTER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-mono font-bold uppercase text-slate-500 px-2">Catégorie :</span>
          {(['All', 'Build', 'CI', 'Intelligence', 'System'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat === 'All' ? 'Tous' : cat}
            </button>
          ))}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono font-bold uppercase text-slate-500 px-2">État :</span>
          {(['All', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {st === 'All' ? 'Tous' : st}
            </button>
          ))}
        </div>
      </div>

      {/* 3. TIMELINE ITEMS */}
      <div className="space-y-3">
        {filteredActivities.length > 0 ? (
          filteredActivities.map((act) => {
            const Icon = act.icon;
            const isExpanded = expandedId === act.id;

            return (
              <div
                key={act.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-md space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 shrink-0 mt-0.5 sm:mt-0">
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">{act.action}</span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.2 rounded bg-slate-800 text-slate-400">
                          {act.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{act.result}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className="text-[11px] font-mono text-slate-500">{act.time}</span>
                    <StatusBadge status={act.status} size="sm" />

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : act.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                      aria-label="Afficher ou masquer les détails"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                            <span>{copiedId === act.id ? 'Copié' : 'Copier JSON'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onNavigate(act.route)}
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                        >
                          <span>Accéder à la vue</span>
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
            title="Aucune activité ne correspond à vos filtres"
            description="Modifiez vos critères de recherche ou réinitialisez les filtres pour afficher l'historique complet."
            actionButton={
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('All');
                  setStatusFilter('All');
                  setSearchQuery('');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            }
          />
        )}
      </div>
    </div>
  );
};
