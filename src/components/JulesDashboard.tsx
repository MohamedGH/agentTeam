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
  BookOpen,
} from 'lucide-react';
import { CodingAgentInfo, CodingAgentResult, JulesActivity } from '../types';

interface JulesDashboardProps {
  onNotify?: (msg: string) => void;
}

export const JulesDashboard: React.FC<JulesDashboardProps> = () => {
  const [agents, setAgents] = useState<CodingAgentInfo[]>([]);
  const [julesConfigured, setJulesConfigured] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Task form state
  const [selectedAgent, setSelectedAgent] = useState<'jules' | 'mock'>('jules');
  const [repository, setRepository] = useState<string>('MohamedGH/agentTeam');
  const [branch, setBranch] = useState<string>('main');
  const [taskPrompt, setTaskPrompt] = useState<string>(
    'Fix the DeepSeek provider and add streaming token metrics'
  );
  const [sessionTitle, setSessionTitle] = useState<string>('Fix DeepSeek Provider');
  const [automationMode, setAutomationMode] = useState<'AUTO_CREATE_PR' | 'MANUAL'>('AUTO_CREATE_PR');
  const [requirePlanApproval, setRequirePlanApproval] = useState<boolean>(false);

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<CodingAgentResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [activities, setActivities] = useState<JulesActivity[]>([]);

  // Session Inspector
  const [inspectSessionId, setInspectSessionId] = useState<string>('');
  const [inspectedSession, setInspectedSession] = useState<any | null>(null);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);

  const fetchAgentInfo = async () => {
    setIsLoading(true);
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
      console.warn('Failed to load coding agents:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentInfo();
  }, []);

  const handleExecute = async () => {
    if (!repository.trim() || !taskPrompt.trim() || isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);
    setResult(null);
    setActivities([]);

    try {
      const res = await fetch('/api/coding-agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: selectedAgent,
          repository: repository.trim(),
          branch: branch.trim() || 'main',
          task: taskPrompt.trim(),
          title: sessionTitle.trim() || undefined,
          automationMode,
          requirePlanApproval,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }

      const data: CodingAgentResult = await res.json();
      setResult(data);
      if (data.activities) {
        setActivities(data.activities);
      }
      if (data.error) {
        setExecutionError(data.error);
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Failed to execute Jules coding task');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInspectSession = async () => {
    if (!inspectSessionId.trim() || isInspecting) return;
    setIsInspecting(true);
    setInspectedSession(null);

    try {
      const res = await fetch(`/api/coding-agents/session/${encodeURIComponent(inspectSessionId.trim())}?agent=${selectedAgent}`);
      if (!res.ok) {
        throw new Error(`Session not found or error (${res.status})`);
      }
      const data = await res.json();
      setInspectedSession(data);
    } catch (err: any) {
      setInspectedSession({ error: err.message });
    } finally {
      setIsInspecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <GitPullRequest className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  Google Jules Autonomous Coding Agent
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    Official v1alpha REST API
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Autonomous cloud coding agent operating directly on GitHub repositories with automated Pull Requests
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">Auth:</span>
              <code className="text-blue-300 font-mono text-[11px]">X-Goog-Api-Key</code>
            </div>

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                hasApiKey || julesConfigured
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {hasApiKey || julesConfigured ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  JULES_API_KEY Configured
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  JULES_API_KEY Not Set (Mock Available)
                </>
              )}
            </div>

            <button
              onClick={fetchAgentInfo}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-all cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* API Architecture Notice */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-200 block mb-1">Architecture Separation</span>
            <span className="text-slate-400 text-[11px]">
              Jules operates via <code className="text-blue-300">CodingAgentManager</code>, strictly independent from LLM token providers in <code className="text-slate-300">ProviderManager</code>.
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-200 block mb-1">Official Base URL</span>
            <span className="text-slate-400 text-[11px] font-mono text-orange-300 truncate block">
              https://jules.googleapis.com/v1alpha
            </span>
            <span className="text-slate-500 text-[10px]">Sources, Sessions, Activities & Automations</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-200 block mb-1">GitHub PR Automation</span>
            <span className="text-slate-400 text-[11px]">
              With <code className="text-emerald-300">AUTO_CREATE_PR</code>, Jules generates repository branch patches and creates ready-to-merge Pull Requests.
            </span>
          </div>
        </div>
      </div>

      {/* Main Execution Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Task Dispatch */}
        <div className="lg:col-span-7 bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Dispatch Jules Coding Task
              </h3>
            </div>

            {/* Target Agent Selector */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setSelectedAgent('jules')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedAgent === 'jules'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google Jules (Cloud)
              </button>
              <button
                type="button"
                onClick={() => setSelectedAgent('mock')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  selectedAgent === 'mock'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hermetic Mock (Test)
              </button>
            </div>
          </div>

          {/* Repository & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-slate-400" />
                GitHub Repository
              </label>
              <input
                type="text"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="owner/repo (e.g. MohamedGH/agentTeam)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                Starting Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Session Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Session Title (Optional)</label>
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="e.g. Fix DeepSeek Provider & Retry Logic"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Task Prompt / Instructions */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              Task Prompt / Specification
            </label>
            <textarea
              rows={4}
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="Describe the bug to fix, feature to implement, or test to write..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-sans focus:outline-none focus:border-orange-500 resize-y"
            />
          </div>

          {/* Automation Mode & Plan Approval */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div>
              <span className="font-semibold text-slate-300 block">Automation Mode:</span>
              <div className="flex items-center gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="automationMode"
                    checked={automationMode === 'AUTO_CREATE_PR'}
                    onChange={() => setAutomationMode('AUTO_CREATE_PR')}
                    className="text-orange-500 focus:ring-0"
                  />
                  <span className="font-medium text-emerald-400">AUTO_CREATE_PR</span>
                  <span className="text-slate-500 text-[11px]">(Auto Pull Request)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="automationMode"
                    checked={automationMode === 'MANUAL'}
                    onChange={() => setAutomationMode('MANUAL')}
                    className="text-orange-500 focus:ring-0"
                  />
                  <span>MANUAL</span>
                  <span className="text-slate-500 text-[11px]">(Branch patch only)</span>
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={requirePlanApproval}
                onChange={(e) => setRequirePlanApproval(e.target.checked)}
                className="rounded border-slate-700 text-orange-500"
              />
              <span>Require Plan Approval</span>
            </label>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Task Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: 'Fix DeepSeek Provider',
                  title: 'Fix DeepSeek Provider',
                  prompt: 'Fix the DeepSeek provider error handling, verify token accounting, and add retry logic with jitter.',
                },
                {
                  label: 'JWT Expiration Guard',
                  title: 'Add JWT Expiration & Revocation',
                  prompt: 'Implement token expiration check and blacklist revocation in src/auth.py with complete pytest test suite.',
                },
                {
                  label: 'Exponential Backoff 429',
                  title: 'Implement Jittered Backoff for 429',
                  prompt: 'Implement calculate_exponential_backoff in src/math_utils.py with full test coverage for rate limits.',
                },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSessionTitle(preset.title);
                    setTaskPrompt(preset.prompt);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer truncate max-w-xs"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              onClick={handleExecute}
              disabled={isExecuting || !repository.trim() || !taskPrompt.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Jules is executing coding session...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Dispatch Task to {selectedAgent === 'jules' ? 'Google Jules' : 'Mock Agent'}
                </>
              )}
            </button>
          </div>

          {executionError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Execution Error:</strong>
                {executionError}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Session Result & Inspector */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Result Card */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Session Execution Result
              </h3>
              {result && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    result.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {result.status}
                </span>
              )}
            </div>

            {result ? (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 text-[11px] block">Session ID:</span>
                  <div className="font-mono text-slate-200 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-[11px] break-all">
                    {result.sessionId}
                  </div>
                </div>

                {/* PR Banner if available */}
                {result.prUrl && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5">
                        <GitPullRequest className="w-4 h-4" />
                        Pull Request Created
                      </span>
                      <a
                        href={result.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-200 underline text-[11px]"
                      >
                        View on GitHub
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-200 mt-1 block truncate">
                      {result.prUrl}
                    </span>
                  </div>
                )}

                {/* Branch Info */}
                {result.gitBranch && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                    <span>Patch Branch:</span>
                    <code className="text-blue-300 font-mono text-[11px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {result.gitBranch}
                    </code>
                  </div>
                )}

                {/* Summary */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 font-bold block mb-1">Agent Summary:</span>
                  <p className="text-slate-200 whitespace-pre-line leading-relaxed">
                    {result.summary}
                  </p>
                </div>

                {/* Activity Feed */}
                {activities.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-slate-300 block">
                      Activities ({activities.length}):
                    </span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {activities.map((act, i) => (
                        <div
                          key={i}
                          className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2"
                        >
                          <span className="text-orange-400 font-mono font-bold text-[10px]">
                            #{i + 1}
                          </span>
                          <span className="flex-1">{act.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">
                <Terminal className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                No active session execution yet. Configure your task and click Dispatch.
              </div>
            )}
          </div>

          {/* Session Inspector Card */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" />
              Session Status Inspector
            </h3>
            <p className="text-xs text-slate-400">
              Query the status and activities of any existing Jules session by ID via <code className="text-slate-300 font-mono">GET /v1alpha/sessions/&#123;id&#125;</code>.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inspectSessionId}
                onChange={(e) => setInspectSessionId(e.target.value)}
                placeholder="Enter sessionId (e.g. sessions/12345)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleInspectSession}
                disabled={isInspecting || !inspectSessionId.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs disabled:opacity-50 transition-all cursor-pointer"
              >
                {isInspecting ? 'Fetching...' : 'Query'}
              </button>
            </div>

            {inspectedSession && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono max-h-48 overflow-y-auto">
                <pre className="text-slate-300 text-[11px]">
                  {JSON.stringify(inspectedSession, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
