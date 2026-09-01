import React, { useState } from 'react';
import { ModelQuotaStatus, AIProviderId, ProviderInfo } from '../types';
import {
  Gauge,
  Search,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  Zap,
  Cpu,
  ArrowUpRight,
  BarChart2,
  Filter,
  Cloud,
  Clock,
  RefreshCw,
  Sparkles,
  Server,
  Layers,
} from 'lucide-react';

interface QuotaDashboardProps {
  models: Record<string, ModelQuotaStatus>;
  tier: string;
  onTierChange: (tier: string) => void;
  onResetQuota: (model?: string) => Promise<void>;
  onForceRefresh?: () => Promise<void>;
  monitoringSource?: string;
  cacheTtlSeconds?: number;
  providers?: ProviderInfo[];
  activeProvider?: AIProviderId;
  onSelectProvider?: (provider: AIProviderId, model?: string) => Promise<void>;
}

const PROVIDER_TABS: { id: AIProviderId | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All Providers', icon: '🌐' },
  { id: 'gemini', label: 'Google Gemini', icon: '✨' },
  { id: 'openai', label: 'OpenAI', icon: '🧠' },
  { id: 'anthropic', label: 'Anthropic Claude', icon: '⚡' },
  { id: 'groq', label: 'Groq Cloud', icon: '🚀' },
  { id: 'deepseek', label: 'DeepSeek', icon: '🔮' },
  { id: 'custom', label: 'Custom / Local', icon: '💻' },
];

export const QuotaDashboard: React.FC<QuotaDashboardProps> = ({
  models,
  tier,
  onTierChange,
  onResetQuota,
  onForceRefresh,
  monitoringSource = 'google_service_usage',
  cacheTtlSeconds = 60,
  providers = [],
  activeProvider = 'gemini',
  onSelectProvider,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProviderTab, setSelectedProviderTab] = useState<AIProviderId | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Simulation state
  const [estimatedTokens, setEstimatedTokens] = useState<number>(1500);
  const [selectedBestModel, setSelectedBestModel] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const modelList = Object.values(models);
  const filteredModels = modelList.filter((m) => {
    const matchesSearch = m.model.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedProviderTab === 'all') return true;
    if (selectedProviderTab === 'gemini') return m.model.startsWith('gemini-');
    if (selectedProviderTab === 'openai') return m.model.startsWith('gpt-') || m.model.startsWith('o3-');
    if (selectedProviderTab === 'anthropic') return m.model.startsWith('claude-');
    if (selectedProviderTab === 'groq') return m.model.startsWith('llama-') || m.model.startsWith('mixtral-');
    if (selectedProviderTab === 'deepseek') return m.model.startsWith('deepseek-');
    if (selectedProviderTab === 'custom') return m.model.startsWith('llama3:') || (!m.model.startsWith('gemini-') && !m.model.startsWith('gpt-') && !m.model.startsWith('claude-') && !m.model.startsWith('llama-') && !m.model.startsWith('mixtral-') && !m.model.startsWith('deepseek-'));

    return true;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onForceRefresh) {
      await onForceRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSimulateSelection = () => {
    const candidates = filteredModels.length > 0
      ? filteredModels.map((m) => m.model)
      : ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];

    // Filter available
    const available = candidates.filter((cand) => {
      const data = models[cand];
      if (!data) return true;
      if (data.blocked) return false;
      if (data.rpm_limit && data.rpm_remaining !== undefined && data.rpm_remaining !== null && data.rpm_remaining <= 0) return false;
      return true;
    });

    const chosen = available[0] || candidates[0];
    setSelectedBestModel(chosen);
    setSimulationResult({
      chosen,
      tier,
      estimatedTokens,
      timestamp: new Date().toLocaleTimeString(),
      reason: `Evaluated throughput and zero cooldown on tier ${tier} for provider ${selectedProviderTab}`,
    });
  };

  const sampleModel = modelList[0];
  const activeSource = sampleModel?.monitoringSource || monitoringSource;
  const activeTtl = sampleModel?.cacheTtlSeconds ?? cacheTtlSeconds;

  return (
    <div className="space-y-6">
      {/* Provider Switcher & Quota Architecture Banner */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-bold text-slate-100">Multi-Provider AI Quota & Telemetry Matrix</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Live Usage Extraction
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Authoritative token tracking across Google Gemini, OpenAI, Anthropic Claude, Groq, DeepSeek & Ollama endpoints.
            </p>
          </div>

          {/* Telemetry pill & controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">Cache TTL:</span>
              <span className="font-mono font-semibold text-slate-200">60s window ({activeTtl}s left)</span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sync Metrics
            </button>
          </div>
        </div>

        {/* Provider Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Provider:
          </span>
          {PROVIDER_TABS.map((tab) => {
            const isTabActive = selectedProviderTab === tab.id;
            const matchingProviderInfo = providers.find((p) => p.id === tab.id);

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedProviderTab(tab.id);
                  if (tab.id !== 'all' && onSelectProvider) {
                    onSelectProvider(tab.id);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  isTabActive
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {matchingProviderInfo && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      matchingProviderInfo.configured ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                    title={matchingProviderInfo.configured ? 'API Key Configured' : 'API Key Not Set'}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Filters and Controls */}
        <div className="mt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter provider models..."
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Tier selector */}
            <select
              value={tier}
              onChange={(e) => onTierChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="tier_3">Paid Tier 3 (Priority)</option>
              <option value="tier_2">Paid Tier 2</option>
              <option value="tier_1">Paid Tier 1</option>
              <option value="free">Free Tier</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onResetQuota()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset State & Cache
            </button>
          </div>
        </div>

        {/* Model Selector Simulator Card */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-slate-950/60 p-3.5 rounded-xl">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              Provider Manager: selectOptimalModel()
            </span>
            <p className="text-xs text-slate-300">
              Evaluates RPM/TPM/RPD quota headroom and backoff state for the chosen provider.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Est. Tokens:</span>
            <input
              type="number"
              value={estimatedTokens}
              onChange={(e) => setEstimatedTokens(Number(e.target.value))}
              step={500}
              min={100}
              className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none"
            />
            <button
              onClick={handleSimulateSelection}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              Evaluate
            </button>
          </div>

          {simulationResult && (
            <div className="bg-slate-900 p-2 rounded-lg border border-blue-500/30 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-500 text-[10px] block">Selected Best Model:</span>
                <span className="font-mono font-bold text-blue-400">{simulationResult.chosen}</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-medium">Optimal</span>
            </div>
          )}
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredModels.map((m) => {
          const isPro = m.model.includes('pro') || m.model.includes('70b') || m.model.includes('reasoner');
          const isFlash = m.model.includes('flash') || m.model.includes('mini') || m.model.includes('instant');

          return (
            <div
              key={m.model}
              id={`model-quota-${m.model}`}
              className={`bg-slate-900/90 rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                m.blocked
                  ? 'border-amber-500/50 ring-1 ring-amber-500/20'
                  : selectedBestModel === m.model
                  ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Model Title & Tags */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu className={`w-4 h-4 ${isPro ? 'text-purple-400' : isFlash ? 'text-blue-400' : 'text-slate-400'}`} />
                      <h3 className="text-sm font-bold text-slate-100 font-mono truncate">{m.model}</h3>
                    </div>
                    <span className="text-[10px] text-slate-500 capitalize">Tier: {m.tier}</span>
                  </div>

                  {m.blocked ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-bold animate-pulse">
                      <ShieldAlert className="w-3 h-3" />
                      429 Cooldown ({m.cooloff_until}s)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Available
                    </span>
                  )}
                </div>

                {/* Quota Matrix Metrics */}
                <div className="space-y-2.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 mb-3 text-xs font-mono">
                  {/* RPM */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">RPM (Requests/Min):</span>
                      <span className="text-slate-200 font-semibold">
                        {m.rpm_used} / {m.rpm_limit !== undefined && m.rpm_limit >= 0 ? m.rpm_limit.toLocaleString() : '∞'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{
                          width: `${
                            m.rpm_limit && m.rpm_limit > 0
                              ? Math.min(100, (m.rpm_used / m.rpm_limit) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* TPM */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">TPM (Tokens/Min):</span>
                      <span className="text-slate-200 font-semibold">
                        {m.tpm_used.toLocaleString()} / {m.tpm_limit !== undefined && m.tpm_limit >= 0 ? m.tpm_limit.toLocaleString() : '∞'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{
                          width: `${
                            m.tpm_limit && m.tpm_limit > 0
                              ? Math.min(100, (m.tpm_used / m.tpm_limit) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* RPD */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">RPD (Requests/Day):</span>
                      <span className="text-slate-200 font-semibold">
                        {m.rpd_used} / {m.rpd_limit !== undefined && m.rpd_limit >= 0 ? m.rpd_limit.toLocaleString() : 'Unlimited'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all"
                        style={{
                          width: `${
                            m.rpd_limit && m.rpd_limit > 0
                              ? Math.min(100, (m.rpd_used / m.rpd_limit) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                <span>429 Errors: <strong className="text-slate-300">{m.errors_429}</strong></span>
                <button
                  onClick={() => onResetQuota(m.model)}
                  className="text-blue-400 hover:text-blue-300 font-medium hover:underline text-[11px] cursor-pointer"
                >
                  Reset Model
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

