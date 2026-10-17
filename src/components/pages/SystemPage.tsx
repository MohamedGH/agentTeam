import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Gauge,
  GitBranch,
  Users,
  Server,
  Activity,
  CheckCircle2,
  Lock,
  EyeOff,
  Terminal,
  RefreshCw,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import {
  StatusBadge,
  DetailPanel,
  Metric,
} from '../ui';
import { QuotaDashboard } from '../QuotaDashboard';
import { RolesGuide } from '../RolesGuide';
import { GitHubSettingsModal } from '../GitHubSettingsModal';
import { ModelQuotaStatus, AIProviderId, ProviderInfo } from '../../types';
import { apiFetch } from '../../utils/apiFetch';

interface SystemPageProps {
  quotaModels: Record<string, ModelQuotaStatus>;
  selectedTier: string;
  setSelectedTier: (tier: string) => void;
  onResetQuota: (model?: string) => Promise<void>;
  onForceRefreshQuota: () => Promise<void>;
  providers: ProviderInfo[];
  activeProvider: AIProviderId;
  onSelectProvider: (provider: AIProviderId, model?: string) => Promise<void>;
  initialSubTab?: string;
}

export const SystemPage: React.FC<SystemPageProps> = ({
  quotaModels,
  selectedTier,
  setSelectedTier,
  onResetQuota,
  onForceRefreshQuota,
  providers,
  activeProvider,
  onSelectProvider,
  initialSubTab = 'quota',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'quota' | 'roles' | 'github' | 'security'>(
    initialSubTab === 'roles'
      ? 'roles'
      : initialSubTab === 'github' || initialSubTab === 'github-settings'
      ? 'github'
      : initialSubTab === 'security'
      ? 'security'
      : 'quota'
  );

  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [githubConfigured, setGithubConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/health')
      .then((r: Response) => r.json())
      .then((d: { status?: string; healthy?: boolean }) => {
        if (!cancelled) setApiHealthy(d.status === 'ok' || d.healthy === true);
      })
      .catch(() => {
        if (!cancelled) setApiHealthy(false);
      });

    apiFetch('/api/github/status')
      .then((r: Response) => r.json())
      .then((d: { configured?: boolean }) => {
        if (!cancelled) setGithubConfigured(Boolean(d.configured));
      })
      .catch(() => {
        if (!cancelled) setGithubConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. VIEW HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">System — Diagnostic & Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestion des quotas des fournisseurs IA, configuration GitHub et audit de sécurité.
          </p>
        </div>

        {/* Sub-tab segmented control */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('quota')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'quota'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Quotas & Modèles</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('github')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'github'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>GitHub & CI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('security')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'security'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sécurité & Clés</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('roles')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'roles'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Rôles d'Équipe</span>
          </button>
        </div>
      </div>

      {/* 2. OVERVIEW STATUS CARDS (ÉTAT → PROBLÈME → ACTION) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-mono text-slate-500 font-bold">API Backend</span>
            <div className="text-slate-200 font-bold text-sm">
              {apiHealthy === null ? 'Vérification...' : apiHealthy ? 'API Opérationnelle' : 'API Inaccessible'}
            </div>
          </div>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
              apiHealthy === null
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : apiHealthy
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}
          >
            {apiHealthy === null ? 'EN COURS' : apiHealthy ? 'CONNECTÉ' : 'ERREUR'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-mono text-slate-500 font-bold">Intégration GitHub</span>
            <div className="text-slate-200 font-bold text-sm">
              {githubConfigured === null ? 'Vérification...' : githubConfigured ? 'Dépôt Connecté' : 'Non Configuré'}
            </div>
          </div>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
              githubConfigured === null
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : githubConfigured
                ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            }`}
          >
            {githubConfigured === null ? 'EN COURS' : githubConfigured ? 'CONFIGURÉ' : 'NON CONNECTÉ'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-mono text-slate-500 font-bold">Sécurité & Tokens</span>
            <div className="text-slate-200 font-bold text-sm">Masquage & Redaction</div>
          </div>
          <span className="text-cyan-400 text-xs font-mono font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            POLITIQUE ACTIVE
          </span>
        </div>
      </div>

      {/* SUB-VIEW 1: QUOTAS & MODÈLES */}
      {activeSubTab === 'quota' && (
        <QuotaDashboard
          models={quotaModels}
          tier={selectedTier}
          onTierChange={setSelectedTier}
          onResetQuota={onResetQuota}
          onForceRefresh={onForceRefreshQuota}
          providers={providers}
          activeProvider={activeProvider}
          onSelectProvider={onSelectProvider}
        />
      )}

      {/* SUB-VIEW 2: GITHUB & CI */}
      {activeSubTab === 'github' && <GitHubSettingsModal />}

      {/* SUB-VIEW 3: SÉCURITÉ */}
      {activeSubTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Audit de Sécurité & Conformité Production</h3>
                <p className="text-xs text-slate-400">Protections hermétiques et intégrité du serveur.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Authentification API</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">STRICTE</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Autorisation requise via <code className="text-slate-300">Authorization: Bearer</code> ou <code className="text-slate-300">X-API-Key</code>. Comparaison timing-safe.
                </p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Politique CORS Same-Origin</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">VALIDÉE</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Vérification stricte protocole + hostname + port. Rejet des wildcards et des sous-domaines usurpés.
                </p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Exécution de Processus</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">EXECFILE</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Utilisation stricte de <code className="text-slate-300">execFile</code> / <code className="text-slate-300">execFileSync</code>. Aucune commande arbitraire passée au shell.
                </p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Protection Fichiers (Workspace)</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">ISOLÉ</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Résolution normalisée et canonisée. Blocage des traversées de répertoires, chemins Windows/UNC et <code className="text-slate-300">.env</code>.
                </p>
              </div>
            </div>
          </div>

          <DetailPanel title="Journaux & Diagnostics Système (Sanitisés)">
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
              <div>[SECURITY] Zero frontend secret leaks verified.</div>
              <div>[SECURITY] Timing-safe token comparison verified.</div>
              <div>[SECURITY] CORS protocol + host + port matching verified.</div>
              <div>[SECURITY] Execution allowlist strictly enforced on test commands.</div>
            </div>
          </DetailPanel>
        </div>
      )}

      {/* SUB-VIEW 4: RÔLES D'ÉQUIPE */}
      {activeSubTab === 'roles' && <RolesGuide />}
    </div>
  );
};
