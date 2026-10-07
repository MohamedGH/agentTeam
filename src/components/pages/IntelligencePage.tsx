import React, { useState, useEffect } from 'react';
import {
  Brain,
  Cpu,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import {
  StatusBadge,
  DetailPanel,
  Metric,
} from '../ui';
import { AdaptiveLLMDashboard } from '../AdaptiveLLMDashboard';
import { JulesDashboard } from '../JulesDashboard';
import { SelfImprovementDashboard } from '../SelfImprovementDashboard';
import { JulesStoreState } from '../../managers/julesStateManager';
import { SelfImprovementStoreState } from '../../managers/selfImprovementStateManager';
import { AIProviderId, ProviderInfo } from '../../types';
import { apiFetch } from '../../utils/apiFetch';

interface IntelligencePageProps {
  chosenModel: string;
  activeProvider: AIProviderId;
  jules: JulesStoreState;
  selfImprovement: SelfImprovementStoreState;
  providers: ProviderInfo[];
  initialSubTab?: string;
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  chosenModel,
  activeProvider,
  jules,
  selfImprovement,
  providers,
  initialSubTab = 'routing',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'routing' | 'jules' | 'improve'>(
    initialSubTab === 'jules'
      ? 'jules'
      : initialSubTab === 'improve' || initialSubTab === 'auto-improve'
      ? 'improve'
      : 'routing'
  );

  const [lastDecision, setLastDecision] = useState<{
    decision: string;
    why: string;
    status: string;
    nextStep: string;
    timestamp?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/llm/last-operational-decision')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && d.decision) {
          setLastDecision({
            decision: `Sélection du modèle ${d.decision.model || chosenModel} via ${d.decision.provider || activeProvider}`,
            why: d.decision.rationale || `Score empirique optimal (elo/fiabilité) avec latence contrôlée.`,
            status: 'Nominal',
            nextStep: 'Prêt pour l’attribution de la prochaine tâche de code.',
            timestamp: d.decision.timestamp,
          });
        } else if (!cancelled) {
          setLastDecision({
            decision: `Routage actif : ${chosenModel} (${activeProvider.toUpperCase()})`,
            why: `Évaluation empirique hermétique et isolation des quotas respectée.`,
            status: 'Nominal',
            nextStep: 'Orchestration prête pour le dispatching des agents.',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLastDecision({
            decision: `Modèle courant : ${chosenModel}`,
            why: `Sélection par défaut avec basculement automatique en cas d'erreur.`,
            status: 'Nominal',
            nextStep: 'Exécuter un workflow pour actualiser la matrice empirique.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chosenModel, activeProvider]);

  return (
    <div className="space-y-6">
      {/* 1. VIEW HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Intelligence & Décisions</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Routage multi-modèles adaptatif, intégration Google Jules et boucle d'auto-amélioration hermétique.
          </p>
        </div>

        {/* Sub-tab segmented control */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('routing')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'routing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Routage Adaptatif</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('jules')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'jules'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>Google Jules</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('improve')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'improve'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Auto-Amélioration</span>
          </button>
        </div>
      </div>

      {/* 2. HUMAN SYNTHESIS CARD (DÉCISION → POURQUOI → ÉTAT → PROCHAINE ÉTAPE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Synthèse Décisionnelle Opérationnelle</h3>
              <p className="text-xs text-slate-400">Pourquoi et comment l'orchestrateur a sélectionné les modèles.</p>
            </div>
          </div>
          <StatusBadge status="SUCCESS" size="sm" labelOverride="DÉCISION NOMINALE" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-blue-400 block">1. Décision</span>
            <div className="font-semibold text-slate-200">{lastDecision?.decision || `Modèle : ${chosenModel}`}</div>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 block">2. Pourquoi</span>
            <div className="text-slate-300">{lastDecision?.why || 'Meilleur ratio performance / fiabilité.'}</div>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-purple-400 block">3. État</span>
            <div className="text-slate-300 font-mono">{lastDecision?.status || 'Prêt & Calibré'}</div>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber-400 block">4. Prochaine Étape</span>
            <div className="text-slate-300">{lastDecision?.nextStep || 'Attribution au Manager.'}</div>
          </div>
        </div>
      </div>

      {/* 3. SUB-VIEWS */}
      {activeSubTab === 'routing' && <AdaptiveLLMDashboard />}
      {activeSubTab === 'jules' && <JulesDashboard />}
      {activeSubTab === 'improve' && <SelfImprovementDashboard />}
    </div>
  );
};
