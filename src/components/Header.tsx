import React from 'react';
import { Users, Gauge, FolderTree, Sparkles, Activity, ShieldCheck, Zap, Globe } from 'lucide-react';
import { AIProviderId, ProviderInfo } from '../types';

interface HeaderProps {
  activeTab: 'studio' | 'workspace' | 'quota' | 'roles';
  setActiveTab: (tab: 'studio' | 'workspace' | 'quota' | 'roles') => void;
  selectedTier: string;
  setSelectedTier: (tier: string) => void;
  isRunning: boolean;
  totalModels: number;
  activeModel: string;
  activeProvider?: AIProviderId;
  providers?: ProviderInfo[];
  onSelectProvider?: (provider: AIProviderId, model?: string) => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedTier,
  setSelectedTier,
  isRunning,
  totalModels,
  activeModel,
  activeProvider = 'gemini',
  providers = [],
  onSelectProvider,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-4 lg:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">agentTeam</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Autonomous Dev Team
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manager • Developer • Tester • Reviewer & Multi-AI Orchestrator
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto overflow-x-auto max-w-full">
          <button
            id="tab-studio"
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'studio'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Agent Studio
            {isRunning && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            id="tab-workspace"
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Virtual Workspace
          </button>

          <button
            id="tab-quota"
            onClick={() => setActiveTab('quota')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'quota'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            Quota & AI Providers
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {totalModels} models
            </span>
          </button>

          <button
            id="tab-roles"
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Team Roles
          </button>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-3">
          {/* Provider Selector */}
          {providers.length > 0 && onSelectProvider && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <select
                id="provider-selector"
                value={activeProvider}
                onChange={(e) => onSelectProvider(e.target.value as AIProviderId)}
                className="bg-transparent text-blue-300 font-semibold focus:outline-none cursor-pointer capitalize"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    {p.name} {p.configured ? '✓' : '(default)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 font-medium">Tier:</span>
            <select
              id="tier-selector"
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="tier_3" className="bg-slate-900 text-slate-200">Paid Tier 3 (Priority)</option>
              <option value="tier_2" className="bg-slate-900 text-slate-200">Paid Tier 2</option>
              <option value="tier_1" className="bg-slate-900 text-slate-200">Paid Tier 1</option>
              <option value="free" className="bg-slate-900 text-slate-200">Free Tier</option>
            </select>
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Model:</span>
            <span className="font-mono text-slate-200 font-medium">{activeModel}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

