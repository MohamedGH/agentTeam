import React, { useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  Brain,
  Sliders,
  Activity,
  Menu,
  X,
  Sparkles,
  Users,
} from 'lucide-react';
import { AIProviderId, ProviderInfo } from '../types';
import { AppRoute, routeManager } from '../managers/routeManager';

export type NavTabId = AppRoute;

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

interface NavItem {
  id: 'dashboard' | 'build' | 'intelligence' | 'system' | 'activity';
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Vue synthétique & Santé globale',
    icon: LayoutDashboard,
  },
  {
    id: 'build',
    label: 'Build & Delivery',
    description: 'Pipeline, Code & CI GitHub',
    icon: Layers,
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Routage LLM, Jules & Auto-Amélioration',
    icon: Brain,
  },
  {
    id: 'system',
    label: 'System',
    description: 'Quotas, Rôles & Sécurité',
    icon: Sliders,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Historique & Timeline globale',
    icon: Activity,
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

  const currentPrimaryPage = routeManager.getPrimaryPage(activeTab);

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-40 transition-all">
      {/* Top Bar: Clean 3-Zone Contract */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30 shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-slate-100 tracking-tight group-hover:text-blue-400 transition-colors">
                agentTeam
              </div>
            </div>
          </button>
        </div>

        {/* Zone 2: Primary 5-Page Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shadow-xs" aria-label="Navigation principale">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPrimaryPage === item.id;

            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>

                {/* Running pulse on Build when workflow active */}
                {item.id === 'build' && isRunning && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: System Context & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Active Model Indicator */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
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
            <strong className="font-mono text-slate-200 text-[11px] truncate max-w-[130px]">
              {activeModel}
            </strong>
          </div>

          {/* Provider Select */}
          {providers.length > 0 && onSelectProvider && (
            <select
              id="provider-select-header"
              value={activeProvider}
              onChange={(e) => onSelectProvider(e.target.value as AIProviderId)}
              className="hidden sm:block bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-mono uppercase focus:outline-none focus:border-blue-500 cursor-pointer"
              aria-label="Sélectionner le provider IA"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Tier Selector */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
            {['free', 'tier_1', 'tier_3'].map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setSelectedTier(tier)}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  selectedTier === tier
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tier.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          {/* Quick Activity Drawer Modal Button */}
          {onOpenActivityCenter && (
            <button
              type="button"
              onClick={onOpenActivityCenter}
              aria-label="Ouvrir le panneau d'activités"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden xl:inline font-semibold">Live</span>
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

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-2">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPrimaryPage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition text-left cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold shadow-md'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <div>
                    <div>{item.label}</div>
                    <div className={`text-[10px] ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                      {item.description}
                    </div>
                  </div>
                </div>

                {item.id === 'build' && isRunning && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
