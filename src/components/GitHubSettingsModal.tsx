import React, { useState, useEffect } from 'react';
import {
  GitPullRequest,
  Key,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Send,
  GitBranch,
  ShieldAlert,
  FolderGit2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Check,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useDeliveryState } from '../managers/useDeliveryState';

interface GitHubStatus {
  configured: boolean;
  user?: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  } | null;
  error?: string;
  warning?: string;
}

export const GitHubSettingsModal: React.FC = () => {
  const [status, setStatus] = useState<GitHubStatus>({ configured: false });
  const [tokenInput, setTokenInput] = useState('');
  const [repoInput, setRepoInput] = useState('MohamedGH/agentTeam');
  const [branchInput, setBranchInput] = useState('main');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; details?: string } | null>(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Global shared Delivery and CI state
  const delivery = useDeliveryState();
  const isPushing = delivery.pushStatus === 'RUNNING';

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/github/status');
      const data = await res.json();
      setStatus(data);

      if (data.configured) {
        await delivery.fetchCiRuns();
      }
    } catch (err: any) {
      setStatus({ configured: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    delivery.setRepositoryAndBranch(repoInput, branchInput);
  }, []);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/github/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim(), owner: 'MohamedGH' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to configure token');
      }

      setFeedback({
        type: 'success',
        message: `Authentification réussie pour @${data.user?.login || 'MohamedGH'} ! Le token est actif.`,
      });
      setStatus({ configured: true, user: data.user });
      setTokenInput('');
      await delivery.fetchCiRuns(delivery.trackedSha);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erreur lors de la configuration du token',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushMain = async () => {
    setFeedback(null);

    const result = await delivery.pushMain({
      repository: repoInput.trim(),
      branch: branchInput.trim(),
      token: tokenInput.trim() || undefined,
    });

    if (result.success) {
      setFeedback({
        type: 'success',
        message: `Push exécuté avec succès vers ${repoInput} sur la branche ${branchInput} !`,
        details: result.commitSha ? `Commit SHA vérifié : ${result.commitSha}` : undefined,
      });
    } else {
      setFeedback({
        type: 'error',
        message: `Échec du push : ${result.error || 'Erreur inconnue'}`,
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
              <GitPullRequest className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Tableau de Bord GitHub & Intégration Continue (CI)
                </h2>
                {status.configured && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Connecté
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Suivi en temps réel des commits réels, statut des workflows GitHub Actions et déclenchement sécurisé.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchStatus}
            disabled={isLoading || delivery.isPolling}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-all cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || delivery.isPolling ? 'animate-spin text-blue-400' : ''}`} />
            Actualiser statut & CI
          </button>
        </div>
      </div>

      {/* 1. Connexion GitHub & Dépôt Cible */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* État de Connexion GitHub */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            1. État de Connexion GitHub
          </span>

          {status.configured && status.user ? (
            <div className="flex items-center justify-between bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src={status.user.avatar_url}
                  alt={status.user.login}
                  className="w-10 h-10 rounded-full border border-slate-700"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white font-mono">@{status.user.login}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-mono">
                      Vérifié
                    </span>
                  </div>
                  <span className="block text-[11px] text-slate-400">ID GitHub : {status.user.id}</span>
                </div>
              </div>
              <a
                href={status.user.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
              >
                Profil <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Token non configuré</strong>
                <p className="mt-0.5 text-slate-400">
                  Définissez la variable d'environnement <code className="text-amber-200">GITHUB_TOKEN</code> ou
                  fournissez un Personal Access Token ci-dessous.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dépôt & Branche Cible */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            2. Dépôt & Branche Cible
          </span>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-blue-400" /> Dépôt autorisé :
              </span>
              <span className="font-mono font-bold text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {repoInput}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
              <span className="text-slate-400 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-emerald-400" /> Branche principale :
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono font-bold">
                {branchInput}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. STATUT DU DERNIER PUSH & CI ASSOCIÉE (SHA RÉEL + ÉTAPES RÉELLES) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                3. Dernier Push & État de la CI GitHub Actions
              </h3>
              <p className="text-xs text-slate-400">
                Traçabilité rigoureuse : corrélation stricte par commit SHA authentique.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => delivery.fetchCiRuns(delivery.trackedSha)}
            disabled={delivery.isPolling || !status.configured}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${delivery.isPolling ? 'animate-spin' : ''}`} />
            {delivery.isPolling ? 'Polling CI en cours (3s)...' : 'Recharger runs CI'}
          </button>
        </div>

        {/* Visual Progress Stepper after Push */}
        {delivery.commitSha && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 flex items-center gap-2 overflow-x-auto text-[11px] font-mono">
            <span className="text-slate-400 shrink-0 font-sans font-semibold">Chaîne livraison :</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 text-blue-300 border border-slate-800 font-bold shrink-0">
              Commit {delivery.commitSha.slice(0, 7)}
            </span>
            <span className="text-slate-600 shrink-0">→</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold shrink-0">
              Push terminé
            </span>
            <span className="text-slate-600 shrink-0">→</span>
            {delivery.ciRunId && delivery.ciHeadSha === delivery.commitSha ? (
              <>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold shrink-0">
                  CI #{delivery.ciRunId}
                </span>
                <span className="text-slate-600 shrink-0">→</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                    delivery.ciStatus === 'COMPLETED' ||
                    delivery.ciStatus === 'TERMINAL_SUCCESS' ||
                    delivery.ciStatus === 'TERMINAL_FAILURE'
                      ? delivery.ciStatus === 'TERMINAL_SUCCESS' || delivery.ciConclusion === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-blue-500/10 text-blue-300 border border-blue-500/20 animate-pulse'
                  }`}
                >
                  {delivery.ciStatus === 'COMPLETED' ||
                  delivery.ciStatus === 'TERMINAL_SUCCESS' ||
                  delivery.ciStatus === 'TERMINAL_FAILURE'
                    ? delivery.ciStatus === 'TERMINAL_SUCCESS' || delivery.ciConclusion === 'success'
                      ? 'CI réussi'
                      : 'CI échoué'
                    : delivery.ciStatus === 'RUNNING'
                    ? 'Tests en cours'
                    : 'CI en attente'}
                </span>
              </>
            ) : delivery.ciStatus === 'NOT_FOUND' ||
              delivery.ciStatus === 'RUN_NOT_FOUND_FOR_SHA' ||
              delivery.ciStatus === 'POLLING_FAILED_TIMEOUT' ? (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                CI non détectée pour ce commit
              </span>
            ) : delivery.ciStatus === 'POLLING_FAILED_NETWORK' ? (
              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                Erreur réseau CI ({delivery.pollAttempts}/20)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse font-bold shrink-0">
                CI en attente de création du workflow
              </span>
            )}
          </div>
        )}

        {/* SHA fourni + run trouvé avec vérification head_sha === trackedSha */}
        {delivery.ciRun && (!delivery.trackedSha || delivery.ciRun.head_sha === delivery.trackedSha) ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3 font-mono text-xs">
            {/* Visual Traceability Chain */}
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                Chaîne de Traçabilité : Commit SHA → Run ID → Workflow → Statut → Conclusion
              </div>
              {!delivery.trackedSha && (
                <span className="text-[10px] text-slate-500 font-sans">
                  (Dernier run global du dépôt)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-slate-300">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">1. Commit SHA</span>
                <span className="text-emerald-400 font-bold truncate block">
                  {delivery.ciRun.head_sha || delivery.commitSha || delivery.trackedSha || 'N/A'}
                </span>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">2. Run ID GitHub</span>
                <span className="text-amber-400 font-bold">#{delivery.ciRun.id}</span>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">3. Workflow</span>
                <span className="text-white font-bold truncate block">{delivery.ciRun.name || 'CI Pipeline'}</span>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">4. Statut & Conclusion</span>
                <span
                  className={`font-bold block truncate ${
                    delivery.ciRun.conclusion === 'success'
                      ? 'text-emerald-400'
                      : delivery.ciRun.status === 'completed'
                      ? 'text-rose-400'
                      : 'text-amber-400 animate-pulse'
                  }`}
                >
                  {delivery.ciRun.status} {delivery.ciRun.conclusion ? `(${delivery.ciRun.conclusion})` : '• en cours'}
                </span>
              </div>
            </div>

            {delivery.ciRun.head_commit?.message && (
              <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                <span className="text-slate-500 font-bold uppercase text-[10px] block mb-0.5">Message du commit réel :</span>
                <span className="text-slate-200">{delivery.ciRun.head_commit.message}</span>
              </div>
            )}

            {/* Étapes du job CI */}
            {delivery.jobs && delivery.jobs.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-slate-400 font-semibold block text-[11px] uppercase tracking-wider">
                  Étapes du Job CI ({delivery.jobs[0]?.name || 'test & build'}) :
                </span>
                <div className="space-y-1.5">
                  {delivery.jobs[0]?.steps?.map((step: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[11px] bg-slate-900/70 px-3 py-1.5 rounded-lg border border-slate-800/80"
                    >
                      <span className="text-slate-300">{step.name}</span>
                      <span
                        className={`font-semibold ${
                          step.conclusion === 'success'
                            ? 'text-emerald-400'
                            : step.status === 'in_progress'
                            ? 'text-amber-400 animate-pulse'
                            : step.conclusion === 'failure'
                            ? 'text-rose-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {step.conclusion || step.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {delivery.ciRun.html_url && (
              <div className="pt-2">
                <a
                  href={delivery.ciRun.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 underline font-sans text-xs"
                >
                  Inspecter l'exécution complète sur GitHub Actions <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        ) : delivery.trackedSha &&
          (delivery.ciStatus === 'NOT_FOUND' ||
            delivery.ciStatus === 'RUN_NOT_FOUND_FOR_SHA' ||
            delivery.ciStatus === 'POLLING_FAILED_TIMEOUT') ? (
          /* SHA fourni + aucun run après les tentatives */
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 text-center text-xs space-y-2">
            <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>CI non détectée pour ce commit</span>
            </div>
            <p className="text-slate-500 font-mono text-[11px]">
              SHA recherché : <span className="text-slate-400">{delivery.trackedSha}</span>
            </p>
            <p className="text-slate-500 text-[11px]">
              Aucun workflow GitHub Actions n'a été déclenché pour ce commit précis après {delivery.pollAttempts} vérifications (arrêt automatique).
            </p>
          </div>
        ) : delivery.trackedSha && delivery.ciStatus === 'POLLING_FAILED_NETWORK' ? (
          /* Erreur réseau pendant le polling */
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-5 text-center text-xs space-y-2">
            <div className="flex items-center justify-center gap-2 text-rose-300 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Erreur réseau lors de la vérification CI</span>
            </div>
            <p className="text-slate-400 font-mono text-[11px]">
              SHA : <span className="text-rose-300">{delivery.trackedSha}</span>
            </p>
            <p className="text-slate-400 text-[11px]">
              Impossible de joindre le serveur ou l'API GitHub (tentative {delivery.pollAttempts}/20).
            </p>
          </div>
        ) : delivery.trackedSha ? (
          /* SHA fourni + run non encore créé */
          <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-5 text-center text-xs space-y-2">
            <div className="flex items-center justify-center gap-2 text-amber-300 font-bold font-mono">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>CI en attente de création du workflow</span>
            </div>
            <p className="text-slate-400 font-mono text-[11px]">
              Commit ciblé : <span className="text-emerald-400 font-semibold">{delivery.trackedSha}</span>
            </p>
            <p className="text-slate-500 text-[11px]">
              Vérification automatique en cours (tentative {delivery.pollAttempts}/20 · polling 3s)...
            </p>
          </div>
        ) : (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400">
            {status.configured ? (
              <p>Aucun run CI récent détecté pour {repoInput}. Déclenchez un push pour lancer la validation CI.</p>
            ) : (
              <p>Veuillez configurer un Personal Access Token ci-dessous pour inspecter les runs de CI.</p>
            )}
          </div>
        )}

        {/* Action Push vers main */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Dernier push enregistré :{' '}
            <span className="font-mono text-slate-200">
              {delivery.commitSha?.slice(0, 7) || delivery.ciRun?.head_sha?.slice(0, 7) || delivery.trackedSha?.slice(0, 7) || 'N/A'}
            </span>
          </div>

          <button
            type="button"
            onClick={handlePushMain}
            disabled={isPushing}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {isPushing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Push en cours vers GitHub...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Pousser vers {branchInput}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div>
            <span className="block font-bold">{feedback.message}</span>
            {feedback.details && <span className="block font-mono mt-1 text-[11px]">{feedback.details}</span>}
          </div>
        </div>
      )}

      {/* 3. PARAMÈTRES AVANCÉS & CONFIGURATION DU TOKEN (PLACÉS PLUS BAS) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <button
          type="button"
          onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
          className="flex items-center justify-between w-full text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <span className="flex items-center gap-2 uppercase tracking-wider">
            <Settings2 className="w-4 h-4 text-blue-400" />
            Paramètres Avancés & Configuration des Tokens (Sécurisé)
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-mono text-[11px]">
              {showAdvancedConfig ? 'Masquer' : 'Afficher'}
            </span>
            {showAdvancedConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvancedConfig && (
          <div className="pt-2 border-t border-slate-800 space-y-4">
            <form onSubmit={handleSaveToken} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1.5 font-medium flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  GitHub Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_... ou github_pat_..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Requis : permissions <code className="text-slate-400">repo</code> (push et création de PR) et{' '}
                  <code className="text-slate-400">actions:read</code> (suivi des workflows).
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !tokenInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? 'Vérification...' : 'Enregistrer et Tester la Connexion'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
