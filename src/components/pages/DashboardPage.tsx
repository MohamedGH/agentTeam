import React, { useState } from 'react';
import {
  Sparkles,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  GitCommit,
  GitPullRequest,
  Activity,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  Clock,
  Terminal,
  Server,
  FolderTree,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  StatusBadge,
  StatusCard,
  ResultBanner,
  NextAction,
  EmptyState,
  DetailPanel,
  Metric,
} from '../ui';
import { AppRoute } from '../../managers/routeManager';
import { WorkflowState } from '../../managers/workflowStateManager';
import { DeliveryState } from '../../managers/deliveryStateManager';
import { SelfImprovementStoreState } from '../../managers/selfImprovementStateManager';
import { JulesStoreState } from '../../managers/julesStateManager';
import { ProviderInfo, AIProviderId } from '../../types';

interface DashboardPageProps {
  workflow: WorkflowState;
  delivery: DeliveryState;
  selfImprovement: SelfImprovementStoreState;
  jules: JulesStoreState;
  taskPrompt: string;
  setTaskPrompt: (prompt: string) => void;
  onRunWorkflow: () => void;
  onAbortWorkflow: () => void;
  onResetWorkflow: () => void;
  onNavigate: (route: AppRoute, params?: Record<string, string>) => void;
  activeProvider: AIProviderId;
  chosenModel: string;
  providers: ProviderInfo[];
  selectedTier: string;
}

const PRESET_SUGGESTIONS = [
  {
    title: 'Fix DeepSeek Provider (Jules)',
    prompt:
      'Fix the DeepSeek provider error handling, verify token accounting, and implement retry logic with exponential jitter.',
    routeHint: 'build' as AppRoute,
  },
  {
    title: 'JWT Auth & Rate Limiter',
    prompt:
      'Implement a secure JWT token generator and validator in src/auth.py with expiration, HMAC SHA256 signatures, and complete pytest test cases.',
    routeHint: 'build' as AppRoute,
  },
  {
    title: 'Exponential Backoff & Retry',
    prompt:
      'Enhance src/math_utils.py with calculate_exponential_backoff function for handling 429 quota retries with jitter and full unit tests.',
    routeHint: 'build' as AppRoute,
  },
];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  workflow,
  delivery,
  selfImprovement,
  jules,
  taskPrompt,
  setTaskPrompt,
  onRunWorkflow,
  onAbortWorkflow,
  onResetWorkflow,
  onNavigate,
  activeProvider,
  chosenModel,
  providers,
  selectedTier,
}) => {
  const isRunning = workflow.executionState === 'RUNNING';
  const hasCompleted = workflow.executionState === 'COMPLETED';
  const hasFailed = workflow.executionState === 'FAILED';

  // Compute Overall System Health
  const systemStatus = (() => {
    if (hasFailed || delivery.ciStatus === 'TERMINAL_FAILURE') return 'WARNING';
    if (isRunning || delivery.ciStatus === 'RUNNING' || selfImprovement.isRunning) return 'RUNNING';
    return 'SUCCESS';
  })();

  const systemStatusLabel = (() => {
    if (hasFailed) return 'Intervention requise';
    if (isRunning) return 'Workflow en cours';
    if (delivery.ciStatus === 'RUNNING') return 'CI GitHub en cours';
    if (selfImprovement.isRunning) return 'Boucle d’amélioration active';
    return 'Système opérationnel & prêt';
  })();

  // Primary Next Action determination
  const nextActionConfig = (() => {
    if (isRunning) {
      return {
        title: `Exécution en cours : Phase ${workflow.currentPhase}/7`,
        description: `L'agent ${workflow.activeAgent || 'Manager'} travaille avec le modèle ${chosenModel}. Vous pouvez suivre l'avancement en temps réel.`,
        buttonLabel: 'Suivre dans Build & Delivery',
        onAction: () => onNavigate('build'),
      };
    }

    if (hasFailed) {
      return {
        title: 'Le dernier workflow a rencontré une difficulté',
        description: workflow.errorMessage || 'Une étape de validation ou de test a échoué. Consultez le diagnostic pour relancer.',
        buttonLabel: 'Inspecter dans Build & Delivery',
        onAction: () => onNavigate('build'),
      };
    }

    if (hasCompleted) {
      if (delivery.ciStatus === 'TERMINAL_SUCCESS') {
        return {
          title: 'Code validé et CI GitHub réussie',
          description: `Toutes les étapes de test, review et CI pour le commit ${delivery.trackedSha?.slice(0, 7) || ''} sont terminées avec succès.`,
          buttonLabel: 'Lancer une nouvelle mission',
          onAction: () => {
            setTaskPrompt('');
            onResetWorkflow();
          },
        };
      }
      return {
        title: 'Workflow terminé avec succès',
        description: 'Les tests et la revue d’architecture sont validés. Prêt pour la prochaine tâche de développement autonome.',
        buttonLabel: 'Voir le code & Workspace',
        onAction: () => onNavigate('build', { subTab: 'workspace' }),
      };
    }

    return {
      title: 'Prêt pour une nouvelle mission logicielle',
      description: 'Saisissez votre prompt ci-dessous pour lancer l’équipe autonome (Manager, Developer, Tester, Reviewer).',
      buttonLabel: 'Démarrer le workflow',
      onAction: onRunWorkflow,
    };
  })();

  return (
    <div className="space-y-6">
      {/* 1. HEALTH & OPERATIONAL OVERVIEW STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Santé Globale
            </span>
            <div className="text-sm font-bold text-slate-100">{systemStatusLabel}</div>
          </div>
          <StatusBadge status={systemStatus} size="sm" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              État Équipe Autonome
            </span>
            <div className="text-sm font-bold text-slate-100 font-mono">
              {isRunning
                ? `Phase ${workflow.currentPhase}/7`
                : hasCompleted
                ? 'Mission terminée'
                : hasFailed
                ? 'Mission échouée'
                : 'En attente'}
            </div>
          </div>
          <StatusBadge status={workflow.executionState} size="sm" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Pipeline GitHub CI
            </span>
            <div className="text-sm font-bold text-slate-100 font-mono">
              {delivery.trackedSha
                ? `SHA ${delivery.trackedSha.slice(0, 7)}`
                : 'Aucun commit récent'}
            </div>
          </div>
          <StatusBadge
            status={
              delivery.ciStatus === 'TERMINAL_SUCCESS'
                ? 'SUCCESS'
                : delivery.ciStatus === 'TERMINAL_FAILURE'
                ? 'FAILED'
                : delivery.ciStatus === 'RUNNING' || delivery.ciStatus === 'QUEUED'
                ? 'RUNNING'
                : 'IDLE'
            }
            size="sm"
          />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              IA & Quotas Actifs
            </span>
            <div className="text-sm font-bold text-slate-100 font-mono truncate max-w-[130px]">
              {chosenModel}
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
            {activeProvider}
          </span>
        </div>
      </div>

      {/* 2. PRIMARY NEXT ACTION (WHAT TO DO NEXT) */}
      <NextAction
        title={nextActionConfig.title}
        description={nextActionConfig.description}
        buttonLabel={nextActionConfig.buttonLabel}
        onAction={nextActionConfig.onAction}
        disabled={!taskPrompt.trim() && !isRunning && !hasCompleted && !hasFailed}
      />

      {/* 3. HERO ACTION CARD: QUICK TASK DISPATCH */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                Action Principale : Nouvelle Mission
              </h3>
              <p className="text-xs text-slate-400">
                L'orchestrateur déploie l'équipe (Manager, Developer, Tester, Reviewer) pour concevoir et tester le code.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              Tier : <strong className="text-blue-300 uppercase">{selectedTier}</strong>
            </span>
          </div>
        </div>

        {/* Text Input & Run Controls */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <div className="relative flex-1">
              <textarea
                id="dashboard-task-input"
                rows={2}
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isRunning) {
                    e.preventDefault();
                    onRunWorkflow();
                  }
                }}
                placeholder="Ex: Développer un module de validation JWT avec expiration, signature HMAC et tests pytest..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all resize-none font-sans"
              />
              <span className="hidden sm:inline-block absolute right-3 bottom-2.5 text-[10px] text-slate-500 font-mono">
                ⌘ + Entrée pour lancer
              </span>
            </div>

            <div className="flex sm:flex-col justify-end gap-2 flex-shrink-0">
              {isRunning ? (
                <button
                  type="button"
                  onClick={onAbortWorkflow}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-500/20 transition cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  Arrêter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRunWorkflow}
                  disabled={!taskPrompt.trim()}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-xl shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Lancer
                </button>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Suggestions :
              </span>
              {PRESET_SUGGESTIONS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTaskPrompt(preset.prompt)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition text-left truncate max-w-[220px] cursor-pointer"
                >
                  {preset.title}
                </button>
              ))}
            </div>

            {workflow.steps.length > 0 && !isRunning && (
              <button
                type="button"
                onClick={onResetWorkflow}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Effacer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. LAST ACTION & RESULT BANNER (ACTION → ÉTAT → RÉSULTAT → DÉTAILS) */}
      {(hasCompleted || hasFailed || isRunning) && (
        <ResultBanner
          actionLabel="Workflow Multi-Agent"
          status={workflow.executionState}
          resultSummary={
            isRunning
              ? `Phase ${workflow.currentPhase}/7 en cours d'exécution par ${workflow.activeAgent || 'manager'}`
              : hasCompleted
              ? `Succès complet : Tests validés (${workflow.finalReport?.tests || '100%'}) · Revue approuvée (${workflow.finalReport?.review || 'Validée'})`
              : workflow.errorMessage || 'Échec de l’exécution'
          }
          nextStep={{
            label: 'Ouvrir Build & Delivery',
            onClick: () => onNavigate('build'),
          }}
          details={
            workflow.finalReport ? (
              <div className="space-y-2">
                <div className="text-slate-300 font-sans text-xs">
                  {workflow.finalReport.testSummary || workflow.finalReport.reviewSummary || 'Workflow terminé avec succès.'}
                </div>
                {workflow.finalReport.filesChanged && workflow.finalReport.filesChanged.length > 0 && (
                  <div className="text-[11px] text-slate-400">
                    Fichiers modifiés : {workflow.finalReport.filesChanged.join(', ')}
                  </div>
                )}
              </div>
            ) : undefined
          }
        />
      )}

      {/* 5. 2-COLUMN SYNTHESIS: CI & RECENT ACTIVITIES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column A: CI & Delivery Snapshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-100">Intégration & Pipeline CI</h4>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('build')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Voir tout</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {delivery.trackedSha ? (
            <div className="space-y-3">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">Commit suivi :</span>
                  <strong className="font-mono text-emerald-400">{delivery.trackedSha.slice(0, 10)}</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Statut pipeline :</span>
                  <StatusBadge
                    status={
                      delivery.ciStatus === 'TERMINAL_SUCCESS'
                        ? 'SUCCESS'
                        : delivery.ciStatus === 'TERMINAL_FAILURE'
                        ? 'FAILED'
                        : delivery.ciStatus === 'RUNNING'
                        ? 'RUNNING'
                        : 'PENDING'
                    }
                    size="sm"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-400 leading-relaxed">
                Corrélation stricte garantissant que les statuts affichés correspondent exactement au SHA commit sans extrapolation.
              </div>
            </div>
          ) : (
            <EmptyState
              title="Aucune exécution CI active"
              description="Lancez une mission de développement pour voir le suivi en temps réel du commit et des workflows GitHub Actions."
              actionButton={
                <button
                  type="button"
                  onClick={() => onNavigate('build')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  Aller dans Build & Delivery →
                </button>
              }
            />
          )}
        </div>

        {/* Column B: Intelligence & Decision Snapshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-400" />
              <h4 className="text-sm font-bold text-slate-100">Intelligence & Routage</h4>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('intelligence')}
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Voir tout</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Modèle actif :</span>
                <strong className="text-slate-200 font-mono">{chosenModel}</strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Auto-amélioration :</span>
                <StatusBadge
                  status={selfImprovement.isRunning ? 'RUNNING' : 'IDLE'}
                  size="sm"
                  labelOverride={selfImprovement.isRunning ? 'BOUCLE ACTIVE' : 'PRÊT'}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Google Jules :</span>
                <span className="text-xs font-mono text-orange-400 font-semibold">
                  {jules.activeSession ? `Session ${jules.activeSession.state}` : 'Prêt (API source validée)'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Orchestration hermétique multi-modèles avec token accounting réel et failover transparent.
            </p>
          </div>
        </div>
      </div>

      {/* 6. TECHNICAL DETAILS DRAWER (COLLAPSIBLE, ZERO CLUTTER BY DEFAULT) */}
      <DetailPanel title="Diagnostics Techniques du Système (Repliés par défaut)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Runtime Engine</span>
            <span className="text-slate-300 block">Node.js 22 + Express + Vite</span>
          </div>
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Auth & Security</span>
            <span className="text-emerald-400 block">Timing-Safe Bearer / X-API-Key</span>
          </div>
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Corrélation SHA</span>
            <span className="text-blue-400 block">Strict head_sha verification</span>
          </div>
        </div>
      </DetailPanel>
    </div>
  );
};
