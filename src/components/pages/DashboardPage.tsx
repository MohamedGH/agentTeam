import React from 'react';
import {
  Sparkles,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  GitCommit,
  Activity,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  StatusBadge,
  DetailPanel,
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
    title: 'Correction de Provider',
    prompt: 'Corriger la gestion d’erreurs et les retries avec jitter pour les providers d’IA.',
  },
  {
    title: 'Authentification JWT',
    prompt: 'Implémenter un générateur et validateur de tokens JWT avec signatures HMAC et tests pytest.',
  },
  {
    title: 'Backoff Exponentiel',
    prompt: 'Ajouter une fonction de retry avec backoff exponentiel pour les erreurs 429 et tests unitaires.',
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

  // 1. HERO / ÉTAT GLOBAL (Human Language First)
  const heroState = (() => {
    if (isRunning) {
      return {
        badge: '● Mission en cours',
        badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        title: 'L’équipe travaille sur votre demande',
        description: `Étape ${workflow.currentPhase} sur 7 : L’agent ${workflow.activeAgent || 'Developer'} analyse et implémente votre consigne.`,
        actionLabel: 'Suivre la mission dans Build',
        actionIcon: ArrowRight,
        onAction: () => onNavigate('build'),
      };
    }
    if (hasFailed) {
      return {
        badge: '✕ Action requise',
        badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        title: 'La dernière mission n’a pas pu être validée',
        description: workflow.errorMessage || 'Une étape de validation ou de test a échoué. Le code a été préservé sans publication.',
        actionLabel: 'Voir le problème & Relancer',
        actionIcon: RotateCcw,
        onAction: () => onNavigate('build'),
      };
    }
    if (hasCompleted) {
      return {
        badge: '✓ Mission terminée',
        badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        title: 'Le code a été développé, testé et validé',
        description: 'Toutes les vérifications d’architecture et de sécurité sont validées. Aucune action requise.',
        actionLabel: 'Voir le résultat dans Build',
        actionIcon: ArrowRight,
        onAction: () => onNavigate('build'),
      };
    }
    return {
      badge: 'Prêt',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      title: 'Prêt pour une nouvelle mission',
      description: 'Décrivez ce que vous souhaitez développer. L’équipe autonome prendra en charge la conception, le code et les tests.',
      actionLabel: 'Lancer la mission',
      actionIcon: Play,
      onAction: onRunWorkflow,
    };
  })();

  const HeroActionIcon = heroState.actionIcon;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. HERO STATUS & PRIMARY ACTION CARD (ÉTAT → EXPLICATION → ACTION) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Status Badge & Hero Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${heroState.badgeColor}`}>
              {heroState.badge}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            {heroState.title}
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed">
            {heroState.description}
          </p>
        </div>

        {/* DOMINANT ACTION (Textarea for IDLE, or Follow/Retry button for active/completed) */}
        {!isRunning && !hasCompleted && !hasFailed ? (
          <div className="space-y-4 pt-2">
            <div className="relative">
              <label htmlFor="dashboard-prompt" className="sr-only">
                Consigne de mission logicielle
              </label>
              <textarea
                id="dashboard-prompt"
                rows={3}
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    onRunWorkflow();
                  }
                }}
                placeholder="Ex: Développer un module de validation JWT avec tests unitaires..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all resize-none"
              />
              <span className="hidden sm:inline-block absolute right-3 bottom-3 text-[11px] text-slate-500 font-mono">
                ⌘ + Entrée pour lancer
              </span>
            </div>

            {/* Main CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium mr-1">Suggestions :</span>
                {PRESET_SUGGESTIONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTaskPrompt(preset.prompt)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    {preset.title}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onRunWorkflow}
                disabled={!taskPrompt.trim()}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <HeroActionIcon className="w-4 h-4 fill-white" />
                <span>{heroState.actionLabel}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              {isRunning
                ? 'Le workflow s’exécute en arrière-plan.'
                : hasCompleted
                ? 'Rapport de validation disponible.'
                : 'Consultez le détail des étapes en échec.'}
            </div>

            <div className="flex items-center gap-2">
              {isRunning && onAbortWorkflow && (
                <button
                  type="button"
                  onClick={onAbortWorkflow}
                  className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-300" />
                  <span>Arrêter</span>
                </button>
              )}

              {(hasCompleted || hasFailed) && onResetWorkflow && (
                <button
                  type="button"
                  onClick={() => {
                    setTaskPrompt('');
                    onResetWorkflow();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  Nouvelle mission
                </button>
              )}

              <button
                type="button"
                onClick={heroState.onAction}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{heroState.actionLabel}</span>
                <HeroActionIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. SYNTHÈSE CLAIRE (2 BLOCS COMPRÉHENSIBLES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Block 1: Pipeline & Livraison */}
        <button
          type="button"
          onClick={() => onNavigate('build')}
          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 text-left transition shadow-md group cursor-pointer space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Build & Livraison</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </div>

          <p className="text-xs text-slate-400">
            {delivery.ciStatus === 'TERMINAL_SUCCESS'
              ? '✓ Livraison GitHub Actions validée avec succès.'
              : delivery.ciStatus === 'RUNNING'
              ? '● Vérification des tests CI en cours sur GitHub.'
              : delivery.ciStatus === 'TERMINAL_FAILURE'
              ? '✕ Échec de la CI GitHub — intervention requise.'
              : 'Pipeline hermétique prêt pour l’exécution.'}
          </p>
        </button>

        {/* Block 2: Intelligence & Décisions */}
        <button
          type="button"
          onClick={() => onNavigate('intelligence')}
          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 text-left transition shadow-md group cursor-pointer space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Cpu className="w-4 h-4 text-violet-400" />
              <span>Intelligence & Décisions</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
          </div>

          <p className="text-xs text-slate-400">
            {selfImprovement.isRunning
              ? '● Boucle d’amélioration active en cours d’évaluation.'
              : jules.activeSession
              ? `Session Google Jules (${jules.activeSession.state}).`
              : 'Routage optimal actif avec isolation des quotas.'}
          </p>
        </button>
      </div>

      {/* 3. DÉTAILS TECHNIQUES (STRICTEMENT REPLIÉS PAR DÉFAUT) */}
      <DetailPanel title="Informations Techniques (Modèle, Quotas & Sécurité)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-slate-400">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Modèle actif</span>
            <span className="text-emerald-400 font-bold truncate block mt-0.5">{chosenModel}</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Fournisseur</span>
            <span className="text-blue-400 font-bold uppercase truncate block mt-0.5">{activeProvider}</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Niveau (Tier)</span>
            <span className="text-slate-200 font-bold uppercase truncate block mt-0.5">{selectedTier}</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Sécurité API</span>
            <span className="text-emerald-400 font-bold truncate block mt-0.5">Bearer / X-API-Key</span>
          </div>
        </div>
      </DetailPanel>
    </div>
  );
};
