import React, { useState, useEffect } from 'react';
import {
  GitPullRequest,
  GitBranch,
  FolderGit2,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Shield,
  Activity,
  Terminal,
  Cpu,
  Clock,
  Search,
  MessageSquare,
  Check,
  ChevronRight,
  Copy,
  Zap,
  Info,
  PauseCircle,
  Radio,
  Send,
} from 'lucide-react';
import { useJulesState } from '../managers/useJulesState';
import { formatDate, truncate } from '../utils/functional';
import { CodingAgentInfo } from '../types';

interface JulesDashboardProps {
  onNotify?: (msg: string) => void;
}

export const JulesDashboard: React.FC<JulesDashboardProps> = ({ onNotify }) => {
  const {
    activeSession,
    activities,
    recentSessions,
    isPolling,
    pollIntervalSeconds,
    isStartingSession,
    isSendingMessage,
    isApprovingPlan,
    isFetching,
    error,
    startSession,
    fetchSession,
    fetchActivities,
    sendMessage,
    approvePlan,
    selectSession,
    setPolling,
    clearError,
  } = useJulesState();

  const [agents, setAgents] = useState<CodingAgentInfo[]>([]);
  const [julesConfigured, setJulesConfigured] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState<boolean>(false);

  // Task form fields
  const [selectedAgent, setSelectedAgent] = useState<'jules' | 'mock'>('jules');
  const [repository, setRepository] = useState<string>('MohamedGH/agentTeam');
  const [branch, setBranch] = useState<string>('main');
  const [taskPrompt, setTaskPrompt] = useState<string>(
    'Fix the DeepSeek provider and add streaming token metrics'
  );
  const [sessionTitle, setSessionTitle] = useState<string>('Fix DeepSeek Provider');
  const [automationMode, setAutomationMode] = useState<'AUTO_CREATE_PR' | 'MANUAL'>('AUTO_CREATE_PR');
  const [requirePlanApproval, setRequirePlanApproval] = useState<boolean>(false);

  // In-session message input
  const [userMessage, setUserMessage] = useState<string>('');

  // Search / Lookup Session ID
  const [lookupId, setLookupId] = useState<string>('');
  const [copiedSessionId, setCopiedSessionId] = useState<boolean>(false);

  // Activity filter
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'AGENT' | 'USER' | 'SYSTEM'>('ALL');

  // Load server agent status
  const fetchAgentInfo = async () => {
    setIsLoadingAgents(true);
    try {
      const res = await fetch('/api/coding-agents/list');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        const jules = data.agents?.find((a: any) => a.id === 'jules');
        if (jules) {
          setJulesConfigured(jules.configured);
        }
      }

      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        const health = await healthRes.json();
        setHasApiKey(Boolean(health.hasJulesApiKey));
      }
    } catch (e) {
      console.warn('Failed to load coding agent configuration:', e);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  useEffect(() => {
    fetchAgentInfo();
  }, []);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository.trim() || !taskPrompt.trim() || isStartingSession) return;

    clearError();
    const session = await startSession({
      agent: selectedAgent,
      repository: repository.trim(),
      branch: branch.trim() || 'main',
      task: taskPrompt.trim(),
      title: sessionTitle.trim() || undefined,
      automationMode,
      requirePlanApproval,
    });

    if (session) {
      onNotify?.(`Jules session ${session.id} started successfully`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !userMessage.trim() || isSendingMessage) return;

    const messageText = userMessage.trim();
    setUserMessage('');
    const ok = await sendMessage(activeSession.id, messageText);
    if (ok) {
      onNotify?.('Message sent to Jules');
    }
  };

  const handleApprovePlan = async () => {
    if (!activeSession || isApprovingPlan) return;
    const ok = await approvePlan(activeSession.id);
    if (ok) {
      onNotify?.('Plan approved. Jules is continuing execution.');
    }
  };

  const handleCopySessionId = (id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    }
  };

  const handleLookupSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;
    selectSession(lookupId.trim());
  };

  const handleRefresh = () => {
    if (activeSession) {
      fetchSession(activeSession.id);
      fetchActivities(activeSession.id);
      onNotify?.('Session data refreshed');
    }
  };

  const filteredActivities = activities.filter((act) => {
    if (activityFilter === 'ALL') return true;
    return (act.originator || 'AGENT').toUpperCase() === activityFilter;
  });

  const isAwaitingApproval =
    activeSession?.state === 'AWAITING_PLAN_APPROVAL' ||
    (activeSession?.state || '').toLowerCase().includes('awaitingplanapproval');

  const isCompleted = activeSession?.state === 'COMPLETED';
  const isFailed = activeSession?.state === 'FAILED';
  const isRunning = !isCompleted && !isFailed && Boolean(activeSession);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Overview & Architecture Header */}
      <div className="bg-slate-900/90 backdrop-blur rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white tracking-tight">Google Jules Coding Agent</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Asynchronous & Observable
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400">
                  Cloud autonomous repository-level coding agent powered by Google Jules API v1alpha.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-medium ${
                hasApiKey || julesConfigured
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>
                {hasApiKey || julesConfigured
                  ? 'JULES_API_KEY Configured'
                  : 'JULES_API_KEY Not Set (Mock Ready)'}
              </span>
            </div>

            <button
              onClick={fetchAgentInfo}
              disabled={isLoadingAgents}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh Agent Config"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingAgents ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Global Error Banner if any */}
        {error && (
          <div className="mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start justify-between gap-3 text-sm text-rose-300">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">{error.message}</p>
                {error.remediation && <p className="text-xs text-rose-300/80 mt-1">{error.remediation}</p>}
              </div>
            </div>
            <button
              onClick={clearError}
              className="text-xs px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded text-rose-200"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Main Grid Layout: Form & Live Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Launch Form & History (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Launch Session Card */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-lg">
            <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
              <Play className="w-4 h-4 text-amber-400" />
              Start Asynchronous Session
            </h3>

            <form onSubmit={handleStartSession} className="space-y-4">
              {/* Agent Mode Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Execution Agent Engine
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAgent('jules')}
                    className={`px-3 py-2.5 rounded-xl text-left border text-xs font-medium transition-all ${
                      selectedAgent === 'jules'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-semibold">Google Jules</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Real cloud API (v1alpha)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedAgent('mock')}
                    className={`px-3 py-2.5 rounded-xl text-left border text-xs font-medium transition-all ${
                      selectedAgent === 'mock'
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-semibold">Hermetic Mock</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Zero-quota sandbox</div>
                  </button>
                </div>
              </div>

              {/* Repository & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    GitHub Repository
                  </label>
                  <div className="relative">
                    <FolderGit2 className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                      placeholder="owner/repo"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Target Branch
                  </label>
                  <div className="relative">
                    <GitBranch className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Task Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Session Title (Optional)
                </label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="e.g. Implement authentication middleware"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                />
              </div>

              {/* Task Prompt */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Task Prompt / Autonomous Instructions
                </label>
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the coding task, bugfix, or feature..."
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-none"
                />
              </div>

              {/* Automation Mode & Plan Approval Toggles */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-xs font-medium text-slate-200">Auto-create Pull Request</div>
                    <div className="text-[10px] text-slate-500">Jules will branch and open a GitHub PR upon completion</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={automationMode === 'AUTO_CREATE_PR'}
                    onChange={(e) => setAutomationMode(e.target.checked ? 'AUTO_CREATE_PR' : 'MANUAL')}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-amber-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-xs font-medium text-slate-200">Require Plan Approval</div>
                    <div className="text-[10px] text-slate-500">Pause execution until you review and approve Jules' plan</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={requirePlanApproval}
                    onChange={(e) => setRequirePlanApproval(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isStartingSession || !repository.trim() || !taskPrompt.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStartingSession ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Starting Session...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Launch Asynchronous Session</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Direct Session ID Lookup */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg">
            <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              Inspect Existing Session by ID
            </h4>
            <form onSubmit={handleLookupSession} className="flex gap-2">
              <input
                type="text"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="e.g. sessions/12345 or 12345"
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!lookupId.trim()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                Inspect
              </button>
            </form>
          </div>

          {/* Recent Sessions List */}
          {recentSessions.length > 0 && (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg">
              <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Recent Sessions ({recentSessions.length})
                </span>
                <span className="text-[10px] text-slate-500">Click to load</span>
              </h4>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {recentSessions.map((sess) => {
                  const isCurrent = activeSession?.id === sess.id;
                  return (
                    <button
                      key={sess.id}
                      onClick={() => selectSession(sess.id)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-slate-300">
                          {sess.id}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {sess.title || sess.prompt || 'Autonomous Task'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            sess.state === 'COMPLETED'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : sess.state === 'FAILED'
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {sess.state || 'QUEUED'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Observable Cockpit (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activeSession ? (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-5">
              {/* Session Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">Session:</span>
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {activeSession.id}
                    </span>
                    <button
                      onClick={() => handleCopySessionId(activeSession.id)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                      title="Copy Session ID"
                    >
                      {copiedSessionId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {activeSession.title || activeSession.prompt || 'Autonomous Jules Task'}
                  </h3>
                </div>

                {/* Status Indicator Pill */}
                <div className="flex items-center gap-2">
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                      isCompleted
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : isFailed
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : isAwaitingApproval
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-400 animate-pulse'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {isRunning && !isAwaitingApproval && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    )}
                    {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isFailed && <AlertTriangle className="w-3.5 h-3.5" />}
                    {isAwaitingApproval && <PauseCircle className="w-3.5 h-3.5" />}
                    <span>{activeSession.state || 'QUEUED'}</span>
                  </div>
                </div>
              </div>

              {/* Plan Approval Callout Banner if AWAITING_PLAN_APPROVAL */}
              {isAwaitingApproval && (
                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-purple-200">Plan Approval Required</h4>
                      <p className="text-xs text-purple-300/80 mt-0.5">
                        Jules has analyzed the codebase and formulated an execution plan. Review the activities below and approve the plan to continue.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleApprovePlan}
                      disabled={isApprovingPlan}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isApprovingPlan ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Approving Plan...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve Plan & Proceed</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Explicit Failure Banner when Jules task has FAILED */}
              {isFailed && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 w-full">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-rose-200">Google Jules Task Failed</h4>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Terminal State
                        </span>
                      </div>
                      <p className="text-xs text-rose-300 font-mono break-words bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/40">
                        {activeSession.resultSummary || 'Task failed during execution or remote entity was not found.'}
                      </p>
                      {activeSession.resultSummary?.includes('404') && (
                        <p className="text-xs text-rose-300/80 pt-1">
                          Tip: In Google Jules, repositories must be connected as a source in the Jules web workspace (<a href="https://jules.google.com" target="_blank" rel="noreferrer" className="underline text-rose-200 hover:text-white">jules.google.com</a>) before the autonomous agent can access them.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Session Meta Specs & PR Link */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500">Repository</span>
                  <div className="font-semibold text-slate-300 truncate">
                    {activeSession.sourceContext?.source?.replace(/^sources\/github\//, '') || repository}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Branch</span>
                  <div className="font-semibold text-slate-300 flex items-center gap-1 truncate">
                    <GitBranch className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{activeSession.gitBranch || branch}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Created At</span>
                  <div className="font-semibold text-slate-300">
                    {formatDate(activeSession.createTime)}
                  </div>
                </div>
              </div>

              {/* PR Banner if created */}
              {activeSession.prUrl && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-emerald-300">
                    <GitPullRequest className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold text-white">Pull Request Ready: </span>
                      <span className="font-mono text-emerald-300/90">{activeSession.prUrl}</span>
                    </div>
                  </div>
                  <a
                    href={activeSession.prUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition-colors shrink-0"
                  >
                    <span>Open Pull Request</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* In-Session Interactive Messaging */}
              <div className="pt-2 border-t border-slate-800">
                <form onSubmit={handleSendMessage} className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    Send Live Instruction / Clarification to Jules
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                      placeholder="e.g. Please also update tests for math helper..."
                      disabled={isSendingMessage || isCompleted || isFailed}
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isSendingMessage || !userMessage.trim() || isCompleted || isFailed}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSendingMessage ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Activity Stream Controller */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Live Activity Stream ({filteredActivities.length})
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* Filter buttons */}
                    <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      {(['ALL', 'AGENT', 'USER', 'SYSTEM'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setActivityFilter(filter)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                            activityFilter === filter
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>

                    {/* Auto Polling Toggle */}
                    <button
                      onClick={() => setPolling(!isPolling, pollIntervalSeconds)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        isPolling
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                      title={isPolling ? 'Live auto-refresh enabled' : 'Auto-refresh paused'}
                    >
                      <Radio className={`w-3 h-3 ${isPolling ? 'animate-pulse text-emerald-400' : ''}`} />
                      <span>{isPolling ? 'Live' : 'Paused'}</span>
                    </button>

                    {/* Manual Refresh */}
                    <button
                      onClick={handleRefresh}
                      disabled={isFetching}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Refresh Activities"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Chronological Activity Feed */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredActivities.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                      Waiting for Jules activities stream...
                    </div>
                  ) : (
                    filteredActivities.map((act, index) => {
                      const originator = (act.originator || 'AGENT').toUpperCase();
                      const isUser = originator === 'USER';
                      const isSystem = originator === 'SYSTEM';

                      return (
                        <div
                          key={act.id || `act_${index}`}
                          className={`p-3 rounded-xl border text-xs transition-colors ${
                            isUser
                              ? 'bg-blue-500/5 border-blue-500/20'
                              : isSystem
                              ? 'bg-slate-800/40 border-slate-700/60'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isUser
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : isSystem
                                    ? 'bg-slate-700 text-slate-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {originator}
                              </span>
                              {act.actionType && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  [{act.actionType}]
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500">
                              {formatDate(act.createTime)}
                            </span>
                          </div>

                          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {act.description || act.output || 'Activity executed'}
                          </p>

                          {act.prUrl && (
                            <a
                              href={act.prUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                              <span>Inspect Pull Request</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-8 text-center shadow-lg space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Active Session Selected</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Launch a new asynchronous session on the left or select a previous session to observe live activity, approve plans, or interact directly with Jules.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRepository('MohamedGH/agentTeam');
                    setTaskPrompt('Fix the DeepSeek provider and add streaming token metrics');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Load Sample Task Preset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
