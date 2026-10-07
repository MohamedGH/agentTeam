import React, { useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  Brain,
  Sliders,
  Activity,
  Menu,
  X,
  Users,
  ArrowRight,
} from 'lucide-react';
import { AppRoute, routeManager } from '../managers/routeManager';

export type NavTabId = AppRoute;

interface HeaderProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  isRunning: boolean;
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
    description: 'Vue synthétique & État global',
    icon: LayoutDashboard,
  },
  {
    id: 'build',
    label: 'Build',
    description: 'Pipeline, Code & Livraison CI',
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
    description: 'Diagnostic & Configuration',
    icon: Sliders,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Historique des actions',
    icon: Activity,
  },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isRunning,
  onOpenActivityCenter,
  activeActivitiesCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentPrimaryPage = routeManager.getPrimaryPage(activeTab);

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2.5 text-left cursor-pointer group shrink-0"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-blue-400/30 shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <span className="text-base sm:text-lg font-bold text-slate-100 tracking-tight group-hover:text-blue-400 transition-colors">
            agentTeam
          </span>
        </button>

        {/* Zone 2: Primary 5 Navigation Links */}
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

                {/* Subtle activity indicator */}
                {item.id === 'build' && isRunning && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Discreet Live Context & Minimal Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Subtle running indicator with direct link to Build */}
          {isRunning && (
            <button
              type="button"
              onClick={() => setActiveTab('build')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/20 transition cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span>Mission en cours</span>
              <ArrowRight className="w-3 h-3 text-blue-400" />
            </button>
          )}

          {/* Quick Activity Button */}
          {onOpenActivityCenter && (
            <button
              type="button"
              onClick={onOpenActivityCenter}
              aria-label="Ouvrir le panneau d'activités"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-blue-400" />
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
            className="md:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Ouvrir le menu de navigation"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
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
