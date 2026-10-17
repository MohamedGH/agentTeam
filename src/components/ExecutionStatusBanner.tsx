import React, { useState } from 'react';
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
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Code2,
  Check,
  RefreshCw,
} from 'lucide-react';
import { AgentRole, AIProviderId, FinalReport } from '../types';
import { DeliveryState } from '../managers/deliveryStateManager';
import { TransportStatus } from '../managers/workflowStateManager';

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
  delivery?: DeliveryState | null;
  transportStatus?: TransportStatus;
  transportMessage?: string | null;
  onStop?: () => void;
  onReset?: () => void;
  onNavigateBuild?: () => void;
}

const HUMAN_PHASE_NAMES: Record<number, { title: string; agent: string; desc: string }> = {
  1: { title: 'Analyse du besoin', agent: 'Manager', desc: 'Définition du plan d’action et des critères de validation.' },
  2: { title: 'Développement du code', agent: 'Developer', desc: 'Implémentation des fonctionnalités dans l’espace de travail.' },
  3: { title: 'Génération des tests', agent: 'Developer', desc: 'Écriture des suites de tests unitaires et d’intégration.' },
  4: { title: 'Exécution des tests QA', agent: 'Tester', desc: 'Vérification automatique et validation hermétique du code.' },
  5: { title: 'Correction des anomalies', agent: 'Developer', desc: 'Résolution des tests en échec ou des cas limites.' },
  6: { title: 'Revue d’architecture & Sécurité', agent: 'Reviewer', desc: 'Audit du code, détection de régressions et validation du Quality Gate.' },
  7: { title: 'Finalisation de la livraison', agent: 'Manager', desc: 'Génération du rapport et préparation du commit Git.' },
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
  delivery,
  transportStatus,
  transportMessage,
  onStop,
  onReset,
  onNavigateBuild,
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // 1. IDLE STATE
  if (executionState === 'IDLE') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" aria-hidden="true" />
          <span className="font-bold text-slate-200 text-xs">Système prêt</span>
          <span className="text-slate-400 hidden sm:inline">· Décrivez votre mission ci-dessous pour démarrer.</span>
        </div>

        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="text-slate-400 hover:text-slate-200 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
        >
          <span>Infos techniques</span>
          {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showTechnicalDetails && (
          <div className="w-full pt-2 mt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center gap-3">
            <span>Provider : <strong className="text-blue-400 uppercase">{activeProvider}</strong></span>
            <span>·</span>
            <span>Modèle : <strong className="text-emerald-400">{chosenModel}</strong></span>
          </div>
        )}
      </div>
    );
  }

  // 2. RUNNING STATE (HUMAN FIRST: ÉTAT → EXPLICATION → ACTION → DÉTAILS)
  if (executionState === 'RUNNING') {
    const phaseInfo = HUMAN_PHASE_NAMES[currentPhase] || {
      title: `Étape ${currentPhase}`,
      agent: activeAgent || 'Developer',
      desc: 'Travail en cours sur votre demande.',
    };

    const progressPct = Math.round((currentPhase / 7) * 100);

    return (
      <div
        role="status"
        aria-live="assertive"
        className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
      >
        {/* Header: Human State */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
                Mission en cours
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              {phaseInfo.title}
            </h3>
            <p className="text-xs text-slate-300">
              L'agent <strong className="text-blue-300">{phaseInfo.agent}</strong> travaille actuellement sur votre demande. {phaseInfo.desc}
            </p>
            {transportMessage && (
              <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold animate-pulse w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                <span>{transportMessage}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {onNavigateBuild && (
              <button
                type="button"
                onClick={onNavigateBuild}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Suivre dans Build</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Arrêter</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar: Étape 3 sur 7 */}
        <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
            <span>Progression globale</span>
            <span className="font-mono text-blue-400">Étape {currentPhase} sur 7 ({progressPct}%)</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Collapsible Technical Details */}
        <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between text-xs">
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Temps écoulé : {elapsedSeconds.toFixed(1)}s</span>
          </div>

          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-slate-400 hover:text-slate-200 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
          >
            <span>Détails techniques</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showTechnicalDetails && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>Agent : <span className="text-slate-200">{activeAgent || 'Manager'}</span></div>
            <div>Modèle : <span className="text-emerald-400">{chosenModel}</span></div>
            <div>Provider : <span className="text-blue-400 uppercase">{activeProvider}</span></div>
            <div>Actions exécutées : <span className="text-amber-300">{stepsCount}</span></div>
          </div>
        )}
      </div>
    );
  }

  // 3. COMPLETED STATE (HUMAN FIRST: ÉTAT RÉEL → EXPLICATION HONNÊTE → ACTION → DÉTAILS)
  if (executionState === 'COMPLETED') {
    const implStatus = finalReport?.implementation;
    const codeDeveloped = implStatus === 'PASS';
    const testsStatus = finalReport?.tests;
    const testsPassed = testsStatus === 'PASS';
    const testsFailed = testsStatus === 'FAIL';
    const reviewStatus = finalReport?.review;
    const reviewApproved = reviewStatus === 'APPROVED';
    const reviewRejected = reviewStatus === 'CHANGES_REQUIRED';

    const localGateValid = Boolean(codeDeveloped && testsPassed && reviewApproved);
    const hasExplicitFailure = testsFailed || reviewRejected || implStatus === 'FAIL';

    const trackedSha = delivery?.trackedSha || delivery?.commitSha || null;
    const ciStatus = delivery?.ciStatus || 'IDLE';
    const ciConfirmed = Boolean(
      ciStatus === 'TERMINAL_SUCCESS' && (!delivery?.trackedSha || delivery?.ciRun?.head_sha === delivery?.trackedSha)
    );
    const ciInProgress = Boolean(
      delivery?.pushStatus === 'RUNNING' ||
        (trackedSha && (ciStatus === 'QUEUED' || ciStatus === 'WAITING_WORKFLOW' || ciStatus === 'RUNNING'))
    );
    const ciFailed = Boolean(
      delivery?.pushStatus === 'FAILED' ||
        ciStatus === 'TERMINAL_FAILURE' ||
        ciStatus === 'RUN_NOT_FOUND_FOR_SHA' ||
        ciStatus === 'NOT_FOUND' ||
        ciStatus === 'POLLING_FAILED_TIMEOUT' ||
        ciStatus === 'POLLING_FAILED_NETWORK'
    );

    // Compute honest summary hierarchy
    let statusBadgeText = 'Mission terminée';
    let statusBadgeColor = 'text-emerald-400';
    let headerTitle = 'Le code a été développé, testé, revu et validé';
    let headerDescription = 'La livraison est confirmée.';
    let isWarningOrFailure = false;

    if (hasExplicitFailure) {
      isWarningOrFailure = true;
      statusBadgeText = 'Action requise';
      statusBadgeColor = 'text-rose-400';
      headerTitle = 'La mission n’a pas pu être validée';
      headerDescription = testsFailed
        ? 'Les tests QA automatisés ont échoué. Le code a été préservé sans publication.'
        : reviewRejected
        ? 'La revue d’architecture & sécurité a rejeté les modifications.'
        : 'L’implémentation du code ne satisfait pas les critères requis.';
    } else if (localGateValid && ciConfirmed) {
      statusBadgeText = 'Mission terminée';
      statusBadgeColor = 'text-emerald-400';
      headerTitle = 'Mission terminée';
      headerDescription = 'Le code a été développé, testé, revu et validé. La livraison est confirmée.';
    } else if (localGateValid && ciInProgress) {
      statusBadgeText = 'Mission terminée — validation GitHub en cours';
      statusBadgeColor = 'text-amber-400';
      headerTitle = 'Mission terminée — validation GitHub en cours';
      headerDescription = 'Le travail local est terminé. GitHub vérifie encore le commit.';
    } else if (localGateValid && ciFailed) {
      isWarningOrFailure = true;
      statusBadgeText = 'Action requise sur la livraison';
      statusBadgeColor = 'text-rose-400';
      headerTitle = 'Travail local validé, mais la vérification CI a échoué';
      headerDescription = delivery?.pushError || `La vérification GitHub Actions n'a pas abouti (${ciStatus}).`;
    } else if (localGateValid && !trackedSha) {
      statusBadgeText = 'Mission terminée';
      statusBadgeColor = 'text-emerald-400';
      headerTitle = 'Mission terminée — validation locale confirmée';
      headerDescription = 'Le code a été développé, testé et revu localement. Aucune livraison GitHub n’a été déclenchée.';
    } else if (testsPassed && !reviewApproved) {
      statusBadgeText = 'Mission terminée — validation partielle';
      statusBadgeColor = 'text-amber-400';
      headerTitle = 'Mission terminée — validation partielle';
      headerDescription = 'Les tests sont validés, mais certaines vérifications restent à confirmer.';
    } else {
      statusBadgeText = 'Mission terminée — validation partielle';
      statusBadgeColor = 'text-amber-400';
      headerTitle = 'Mission terminée — vérifications à confirmer';
      headerDescription = 'Le cycle est achevé mais certaines validations (tests, revue) restent à confirmer.';
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className={`bg-gradient-to-r ${
          isWarningOrFailure
            ? 'from-rose-950/40 via-slate-900 to-slate-900 border-rose-500/30'
            : ciInProgress
            ? 'from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/30'
            : 'from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30'
        } border rounded-2xl p-5 sm:p-6 shadow-xl space-y-4`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isWarningOrFailure ? (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : ciInProgress ? (
                <Loader2 className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className={`text-xs font-mono font-bold uppercase tracking-wider ${statusBadgeColor}`}>
                {statusBadgeText}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              {headerTitle}
            </h3>
            <p className="text-xs text-slate-300">
              {headerDescription}
            </p>
            {transportMessage === 'Rapport récupéré' && (
              <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold w-fit">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Rapport récupéré avec succès après reconnexion</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Nouvelle mission</span>
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Real Verification Indicators (No false PASS or 100% fallbacks) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Card 1: Code développé */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center gap-2">
            {codeDeveloped ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : implStatus === 'FAIL' ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-slate-200">
              {codeDeveloped ? 'Code développé (PASS)' : implStatus === 'FAIL' ? 'Code en échec (FAIL)' : `Code : ${implStatus || 'À confirmer'}`}
            </span>
          </div>

          {/* Card 2: Tests validés */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center gap-2">
            {testsPassed ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : testsFailed ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : testsStatus === 'SKIPPED' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-slate-200">
              {testsPassed
                ? 'Tests validés (PASS)'
                : testsFailed
                ? 'Tests en échec (FAIL)'
                : testsStatus === 'SKIPPED'
                ? 'Tests ignorés (SKIPPED)'
                : 'Tests : Non disponible'}
            </span>
          </div>

          {/* Card 3: Revue */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center gap-2">
            {reviewApproved ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : reviewRejected ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : reviewStatus === 'SKIPPED' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-slate-200">
              {reviewApproved
                ? 'Revue approuvée (APPROVED)'
                : reviewRejected
                ? 'Modifications requises (CHANGES_REQUIRED)'
                : reviewStatus === 'SKIPPED'
                ? 'Revue ignorée (SKIPPED)'
                : 'Revue : À confirmer'}
            </span>
          </div>

          {/* Card 4: Quality Gate & Livraison */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center gap-2">
            {localGateValid && ciConfirmed ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : localGateValid && ciInProgress ? (
              <Loader2 className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
            ) : localGateValid && ciFailed ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : localGateValid ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : hasExplicitFailure ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-slate-200">
              {localGateValid && ciConfirmed
                ? 'Livraison confirmée'
                : localGateValid && ciInProgress
                ? 'CI GitHub en cours'
                : localGateValid && ciFailed
                ? 'Échec livraison CI'
                : localGateValid
                ? 'Quality Gate local OK'
                : hasExplicitFailure
                ? 'Quality Gate refusé'
                : 'Quality Gate : En attente'}
            </span>
          </div>
        </div>

        {/* Collapsible Details */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-slate-400">Durée totale : {elapsedSeconds.toFixed(1)}s</span>
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-slate-400 hover:text-slate-200 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
          >
            <span>Détails techniques</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showTechnicalDetails && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
            <div>Modèle utilisé : <span className="text-emerald-400">{chosenModel}</span></div>
            <div>Provider : <span className="text-blue-400 uppercase">{activeProvider}</span></div>
            {finalReport?.filesChanged && (
              <div>Fichiers modifiés : <span className="text-slate-200">{finalReport.filesChanged.join(', ')}</span></div>
            )}
            {trackedSha && (
              <div>Commit/SHA associé : <span className="text-indigo-300">{trackedSha}</span> (CI : <span className="text-amber-300">{ciStatus}</span>)</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 4. FAILED STATE (HUMAN FIRST: ÉTAT → EXPLICATION → ACTION → DÉTAILS)
  if (executionState === 'FAILED') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
                Action requise
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              La dernière mission n'a pas pu être validée
            </h3>
            <p className="text-xs text-slate-300">
              Le système a arrêté l'exécution pour protéger votre dépôt. Consultez l'analyse ci-dessous.
            </p>
            {transportMessage && (
              <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold w-fit">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>{transportMessage}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Relancer la mission</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Structured Explanations: Pourquoi -> Impact -> Que faire */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-500/20 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-rose-400 block">Pourquoi ?</span>
            <span className="text-slate-300 block">{errorMessage || 'Une étape de validation ou de test a échoué.'}</span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber-400 block">Impact ?</span>
            <span className="text-slate-300 block">Le code incomplet est bloqué ; aucun commit n'a été publié.</span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-blue-400 block">Que faire maintenant ?</span>
            <span className="text-slate-300 block">Ajustez les instructions ou relancez la mission.</span>
          </div>
        </div>

        {/* Collapsible Details */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-end text-xs">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-slate-400 hover:text-slate-200 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
          >
            <span>Détails techniques</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showTechnicalDetails && errorMessage && (
          <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-rose-300 overflow-x-auto whitespace-pre-wrap">
            {errorMessage}
          </pre>
        )}
      </div>
    );
  }

  // 5. CANCELLED STATE
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs"
    >
      <div className="flex items-center gap-2.5">
        <StopCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <span className="font-bold text-slate-200">Mission arrêtée</span>
          <span className="text-slate-400 text-[11px] ml-2">L'exécution a été interrompue à votre demande.</span>
        </div>
      </div>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
        >
          Nouvelle mission
        </button>
      )}
    </div>
  );
};
