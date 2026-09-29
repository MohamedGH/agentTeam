import React, { useState } from 'react';
import {
  Users,
  Gauge,
  FolderTree,
  Sparkles,
  ShieldCheck,
  Globe,
  GitPullRequest,
  Cpu,
  Brain,
  GitBranch,
  ChevronDown,
  Layers,
  Settings,
  Menu,
  X,
  Activity,
} from 'lucide-react';
import { AIProviderId, ProviderInfo } from '../types';

export type NavTabId =
  | 'studio'
  | 'workspace'
  | 'quota'
  | 'roles'
  | 'jules'
  | 'auto-improve'
  | 'adaptive-llm'
  | 'github-settings';

interface HeaderProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  selectedTier: string;
  setSelectedTier: (tier: string) => void;
  isRunning: boolean;
  totalModels: number;
  activeModel: string;
  activeProvider?: AIProviderId;
  providers?: ProviderInfo[];
  onSelectProvider?: (provider: AIProviderId, model?: string) => Promise<void>;
  onOpenActivityCenter?: () => void;
  activeActivitiesCount?: number;
}

interface NavCategory {
  id: 'build' | 'intelligence' | 'system';
  label: string;
  description: string;
  tabs: {
    id: NavTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    color?: string;
  }[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'build',
    label: 'BUILD',
    description: 'Développement autonome & Espace de code',
    tabs: [
      {
        id: 'studio',
        label: 'Agent Studio',
        icon: Sparkles,
        color: 'text-blue-400',
      },
      {
        id: 'workspace',
        label: 'Workspace',
        icon: FolderTree,
        color: 'text-cyan-400',
      },
      {
        id: 'jules',
        label: 'Google Jules',
        icon: GitPullRequest,
        badge: 'Agent',
        color: 'text-orange-400',
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    description: 'Routage empirique & Auto-amélioration',
    tabs: [
      {
        id: 'adaptive-llm',
        label: 'Adaptive LLM',
        icon: Brain,
        badge: 'Auto',
        color: 'text-violet-400',
      },
      {
        id: 'auto-improve',
        label: 'Auto-Improvement',
        icon: Cpu,
        badge: 'Loop',
        color: 'text-indigo-400',
      },
      {
        id: 'quota',
        label: 'Quota & Providers',
        icon: Gauge,
        color: 'text-emerald-400',
      },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    description: 'Spécifications & Intégration CI',
    tabs: [
      {
        id: 'roles',
        label: 'Team Roles',
        icon: ShieldCheck,
        color: 'text-amber-400',
      },
      {
        id: 'github-settings',
        label: 'GitHub & CI',
        icon: GitBranch,
        color: 'text-rose-400',
      },
    ],
  },
];

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
  onOpenActivityCenter,
  activeActivitiesCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-40 transition-all">
      {/* Top Bar: Brand + Essential System Controls */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3 border-b border-slate-900">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30 flex-shrink-0">
            <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">agentTeam</h1>
              <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                v2.0 • Autonomous Multi-Agent
              </span>
            </div>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Model Indicator */}
          <div className="hidden md:flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
            <span className="flex h-2 w-2 relative" aria-hidden="true">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isRunning ? 'bg-emerald-400' : 'bg-blue-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isRunning ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
              />
            </span>
            <span className="text-slate-400 font-medium">Modèle :</span>
            <strong className="font-mono text-slate-200 text-[11px] truncate max-w-[140px]">{activeModel}</strong>
          </div>

          {/* Provider Quick Dropdown */}
          {providers.length > 0 && onSelectProvider && (
            <div className="relative inline-block">
              <select
                id="provider-select-header"
                value={activeProvider}
                onChange={(e) => onSelectProvider(e.target.value as AIProviderId)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-mono uppercase focus:outline-none focus:border-blue-500 cursor-pointer pr-6"
                aria-label="Sélectionner le provider IA"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tier Selector */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
            {['free', 'tier_1', 'tier_3'].map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setSelectedTier(tier)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  selectedTier === tier
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tier.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          {/* Activity Center Button */}
          {onOpenActivityCenter && (
            <button
              type="button"
              onClick={onOpenActivityCenter}
              aria-label="Ouvrir le centre d'activités"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline font-semibold">Activités</span>
              {typeof activeActivitiesCount === 'number' && activeActivitiesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono text-[10px] font-bold border border-blue-500/30 animate-pulse">
                  {activeActivitiesCount}
                </span>
              )}
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            aria-label="Ouvrir le menu de navigation"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Categorized Navigation Bar (Desktop / Tablet) */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2 hidden md:flex items-center justify-between gap-4 overflow-x-auto">
        <nav className="flex items-center gap-6" aria-label="Navigation principale">
          {NAV_CATEGORIES.map((category) => (
            <div key={category.id} className="flex items-center gap-1.5">
              {/* Category Label */}
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1.5 select-none font-mono">
                {category.label}
              </span>

              {/* Sub-tabs for this category */}
              <div className="flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-800/90 shadow-xs">
                {category.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color || 'text-slate-400'}`} />
                      <span>{tab.label}</span>

                      {/* Running Pulse indicator on Studio */}
                      {tab.id === 'studio' && isRunning && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                      )}

                      {/* Micro badge */}
                      {tab.badge && !isActive && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-4">
          {NAV_CATEGORIES.map((category) => (
            <div key={category.id} className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                {category.label} — <span className="text-slate-500 font-normal">{category.description}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {category.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      id={`mobile-tab-${tab.id}`}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-all text-left ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'bg-slate-900/80 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color || 'text-slate-400'}`} />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
};
