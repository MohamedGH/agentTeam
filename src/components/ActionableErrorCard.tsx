import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, ShieldAlert, ArrowRight } from 'lucide-react';

export interface ActionableErrorProps {
  title?: string;
  error: string | Error | null;
  onRetry?: () => void;
  onNavigateToConfig?: () => void;
  configLabel?: string;
  className?: string;
}

interface ParsedErrorDetails {
  title: string;
  cause: string;
  consequence: string;
  action: string;
  rawDetails?: string;
}

function parseTechnicalError(rawError: string | Error | null, customTitle?: string): ParsedErrorDetails {
  const message = typeof rawError === 'string' ? rawError : rawError?.message || 'Une erreur inattendue est survenue.';
  const lower = message.toLowerCase();

  if (lower.includes('identity') || lower.includes('identit') || lower.includes('failover') || lower.includes('proof')) {
    return {
      title: customTitle || "Non-conformité d'identité du modèle LLM",
      cause: "Le provider a retourné un modèle ou une preuve qui ne correspond pas exactement au modèle requis (vérification fail-closed).",
      consequence: "L'exécution a été interrompue immédiatement pour préserver l'intégrité et la fiabilité des décisions.",
      action: "Relancez le workflow ou sélectionnez un provider disposant d'un modèle vérifié.",
      rawDetails: message,
    };
  }

  if (lower.includes('quota') || lower.includes('429') || lower.includes('rate limit') || lower.includes('resource_exhausted')) {
    return {
      title: customTitle || "Quota ou limite d'appels API atteinte",
      cause: "Le fournisseur d'IA a temporairement refusé la requête en raison d'un épuisement de quota (HTTP 429).",
      consequence: "Le modèle a été automatiquement placé en période de refroidissement (cooldown).",
      action: "Attendez la fin du cooldown, réinitialisez le quota dans le tableau de bord, ou basculez sur un autre provider.",
      rawDetails: message,
    };
  }

  if (lower.includes('no feasible model') || lower.includes('constraint')) {
    return {
      title: customTitle || "Aucun modèle ne satisfait les contraintes",
      cause: "Les contraintes strictes (capacités requises, latence max, coût max) éliminent tous les modèles actuellement éligibles.",
      consequence: "Le sélecteur adaptatif refuse de router vers un modèle non conforme (décision NO_FEASIBLE_MODEL).",
      action: "Assouplissez les contraintes de coût/latence ou activez des providers complémentaires.",
      rawDetails: message,
    };
  }

  if (lower.includes('git') || lower.includes('github') || lower.includes('token') || lower.includes('push')) {
    return {
      title: customTitle || "Erreur d'intégration Git / GitHub",
      cause: "La communication avec le dépôt GitHub a échoué (authentification PAT, permissions ou conflit de branche).",
      consequence: "Le push ou la création de pull request n'a pas pu être finalisé.",
      action: "Vérifiez votre Personal Access Token dans l'onglet 'GitHub & CI' et assurez-vous des droits d'écriture sur le dépôt.",
      rawDetails: message,
    };
  }

  if (lower.includes('review') || lower.includes('reviewer') || lower.includes('security')) {
    return {
      title: customTitle || "Échec du Gate de Revue Architecturale",
      cause: "L'agent Reviewer a détecté des régressions, des violations de sécurité ou une non-conformité architecturale.",
      consequence: "La livraison finale et le merge Git sont strictement bloqués.",
      action: "Inspectez les remarques du Reviewer dans le rapport final et ajustez votre consigne.",
      rawDetails: message,
    };
  }

  if (lower.includes('qa') || lower.includes('test') || lower.includes('pytest')) {
    return {
      title: customTitle || "Échec des Tests Unitaires & QA",
      cause: "La suite de tests a échoué lors de la validation du code produit par le Developer.",
      consequence: "Le workflow a épuisé ses cycles de correction automatique sans parvenir à 100% de succès.",
      action: "Consultez la sortie détaillée du terminal de test et précisez le cas d'usage attendu.",
      rawDetails: message,
    };
  }

  return {
    title: customTitle || "Échec de l'opération",
    cause: message,
    consequence: "L'opération en cours n'a pas pu se terminer avec succès.",
    action: "Vérifiez les paramètres d'entrée ou tentez à nouveau l'opération.",
    rawDetails: message,
  };
}

export const ActionableErrorCard: React.FC<ActionableErrorProps> = ({
  title,
  error,
  onRetry,
  onNavigateToConfig,
  configLabel = 'Gérer la configuration',
  className = '',
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!error) return null;

  const parsed = parseTechnicalError(error, title);

  return (
    <div
      role="alert"
      className={`bg-rose-950/40 border border-rose-500/40 rounded-xl p-4.5 text-slate-200 shadow-lg shadow-rose-950/20 space-y-3.5 ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-rose-300 tracking-tight">{parsed.title}</h4>
            <p className="text-xs text-rose-200/80 font-medium mt-0.5">Détail du blocage opérationnel</p>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Réessayer
          </button>
        )}
      </div>

      {/* Structured 3-part card: Cause, Consequence, Action */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs bg-slate-950/70 p-3 rounded-lg border border-rose-500/20">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">1. Cause</span>
          <p className="text-slate-300 leading-relaxed">{parsed.cause}</p>
        </div>

        <div className="space-y-1 border-t md:border-t-0 md:border-l border-rose-500/15 pt-2 md:pt-0 md:pl-2.5">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">2. Conséquence</span>
          <p className="text-slate-300 leading-relaxed">{parsed.consequence}</p>
        </div>

        <div className="space-y-1 border-t md:border-t-0 md:border-l border-rose-500/15 pt-2 md:pt-0 md:pl-2.5">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">3. Action possible</span>
          <p className="text-slate-300 leading-relaxed">{parsed.action}</p>
        </div>
      </div>

      {/* Action shortcuts & Technical details toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {onNavigateToConfig && (
          <button
            type="button"
            onClick={onNavigateToConfig}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            {configLabel}
          </button>
        )}

        {parsed.rawDetails && (
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 ml-auto font-mono cursor-pointer transition-colors"
          >
            {showTechnicalDetails ? (
              <>
                <ChevronUp className="w-3 h-3" /> Masquer détail technique
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" /> Voir trace technique brute
              </>
            )}
          </button>
        )}
      </div>

      {showTechnicalDetails && parsed.rawDetails && (
        <div className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-rose-300/90 overflow-x-auto max-h-36 whitespace-pre-wrap select-all">
          {parsed.rawDetails}
        </div>
      )}
    </div>
  );
};
