import React, { useState, useEffect } from 'react';
import { GitPullRequest, Key, CheckCircle2, AlertTriangle, ArrowUpRight, RefreshCw, Send, GitBranch, ShieldAlert } from 'lucide-react';

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
  const [isPushing, setIsPushing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; details?: string } | null>(null);
  const [lastPushResult, setLastPushResult] = useState<any>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/github/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setStatus({ configured: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
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
    setIsPushing(true);
    setFeedback(null);
    setLastPushResult(null);

    try {
      const res = await fetch('/api/github/push-main', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: repoInput.trim(),
          branch: branchInput.trim(),
          token: tokenInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Push failed');
      }

      setLastPushResult(data);
      const actualSha = data.push?.commitSha || 'N/A';
      setFeedback({
        type: 'success',
        message: `Push exécuté avec succès vers ${repoInput} sur la branche ${branchInput} !`,
        details: actualSha !== 'N/A' ? `Commit SHA: ${actualSha}` : undefined,
      });
      fetchStatus();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Échec du push: ${err.message}`,
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 text-emerald-400">
              <GitPullRequest className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Paramètres GitHub & Push
                {status.configured && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Connecté
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Configuration du GitHub Personal Access Token pour l'authentification et le déclenchement de la CI.
              </p>
            </div>
          </div>

          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualiser statut
          </button>
        </div>
      </div>

      {/* Account / Status Banner */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          État de connexion GitHub
        </h3>

        {status.configured && status.user ? (
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              <img
                src={status.user.avatar_url}
                alt={status.user.login}
                className="w-10 h-10 rounded-full border border-slate-700"
              />
              <div>
                <span className="text-sm font-bold text-white">@{status.user.login}</span>
                <span className="block text-xs text-slate-400">ID GitHub: {status.user.id}</span>
              </div>
            </div>
            <a
              href={status.user.html_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              Voir le profil <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3 text-xs text-amber-300">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold text-amber-200">Aucun token GitHub actif configuré</strong>
              Renseigne ton Personal Access Token (PAT) ci-dessous pour permettre à l'application d'effectuer le push vers le dépôt <code>MohamedGH/agentTeam</code> et exécuter la CI distante.
            </div>
          </div>
        )}
      </div>

      {/* Formulaire de configuration du Token */}
      <form onSubmit={handleSaveToken} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          Renseigner / Mettre à jour le Token GitHub (PAT)
        </h3>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">
            GitHub Personal Access Token (Classic ou Fine-Grained avec permission <code>repo</code>)
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ghp_... ou github_pat_..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <span className="block text-[11px] text-slate-500 mt-1">
            Générer sur : <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">github.com/settings/tokens</a> (Sélectionner les scopes <code>repo</code> et <code>workflow</code>).
          </span>
        </div>

        <button
          type="submit"
          disabled={!tokenInput.trim() || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <Key className="w-3.5 h-3.5" />
          Enregistrer et vérifier le token
        </button>
      </form>

      {/* Section Direct Push */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-400" />
          Déclencher le Push vers MohamedGH/agentTeam
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-medium">Dépôt cible</label>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-medium">Branche cible</label>
            <input
              type="text"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handlePushMain}
            disabled={isPushing}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className={`w-4 h-4 ${isPushing ? 'animate-pulse' : ''}`} />
            {isPushing ? 'Push en cours vers GitHub...' : `Pousser vers ${branchInput}`}
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
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

      {/* Last Push CI Follow-up & Real-time Live Inspector */}
      {status.configured && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400" />
              Statut de la CI GitHub Actions (Vérification Distante Réelle)
            </h3>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/github/ci-runs?repository=${encodeURIComponent(repoInput)}`);
                  const data = await res.json();
                  if (data.success && data.runs && data.runs.length > 0) {
                    setLastPushResult((prev: any) => ({
                      ...prev,
                      ciRun: data.runs[0],
                      jobs: data.jobs,
                    }));
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Recharger runs CI
            </button>
          </div>

          {lastPushResult?.ciRun ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-slate-400">Workflow: <strong className="text-white">{lastPushResult.ciRun.name || 'CI'}</strong></span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  lastPushResult.ciRun.conclusion === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  lastPushResult.ciRun.status === 'completed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                  'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                }`}>
                  {lastPushResult.ciRun.status} {lastPushResult.ciRun.conclusion ? `(${lastPushResult.ciRun.conclusion})` : '• en cours'}
                </span>
              </div>

              <div className="text-slate-300 space-y-1">
                <div>Run ID : <span className="text-amber-400">{lastPushResult.ciRun.id}</span></div>
                <div>Commit SHA : <span className="text-emerald-400">{lastPushResult.ciRun.head_sha}</span></div>
                <div>Message : <span className="text-slate-200">{lastPushResult.ciRun.head_commit?.message || 'feat(adaptive-llm)...'}</span></div>
              </div>

              {lastPushResult.jobs && lastPushResult.jobs.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase tracking-wider">Étapes du Job CI :</span>
                  {lastPushResult.jobs[0]?.steps?.map((step: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800/80">
                      <span className="text-slate-300">{step.name}</span>
                      <span className={
                        step.conclusion === 'success' ? 'text-emerald-400' :
                        step.status === 'in_progress' ? 'text-amber-400 animate-pulse' :
                        step.conclusion === 'failure' ? 'text-rose-400' : 'text-slate-500'
                      }>
                        {step.conclusion || step.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <a
                  href={lastPushResult.ciRun.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 underline"
                >
                  Ouvrir l'exécution en direct sur GitHub Actions <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Aucun résultat CI chargé pour l'instant. Cliquez sur "Pousser le commit vers main" ou sur "Recharger runs CI".
            </p>
          )}
        </div>
      )}
    </div>
  );
};
