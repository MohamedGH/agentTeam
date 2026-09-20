import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { AgentVisualizer } from './components/AgentVisualizer';
import { ExecutionTimeline } from './components/ExecutionTimeline';
import { FinalReportCard } from './components/FinalReportCard';
import { WorkspaceExplorer } from './components/WorkspaceExplorer';
import { QuotaDashboard } from './components/QuotaDashboard';
import { RolesGuide } from './components/RolesGuide';
import { JulesDashboard } from './components/JulesDashboard';
import { SelfImprovementDashboard } from './components/SelfImprovementDashboard';
import { AdaptiveLLMDashboard } from './components/AdaptiveLLMDashboard';
import { AgentStep, FinalReport, AgentRole, ModelQuotaStatus, AIProviderId, ProviderInfo } from './types';
import { routeManager, AppRoute } from './managers/routeManager';
import {
  Play,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Layers,
  CheckCircle2,
  Globe,
  Square,
  Clock,
  RotateCcw,
  GitPullRequest,
  FolderGit2,
  GitBranch,
} from 'lucide-react';

const PRESET_TASKS = [
  {
    title: 'Fix DeepSeek Provider (Jules)',
    prompt:
      'Fix the DeepSeek provider error handling, verify token accounting, and implement retry logic with exponential jitter.',
  },
  {
    title: 'JWT Auth & Rate Limiter',
    prompt:
      'Implement a secure JWT token generator and validator in src/auth.py with expiration, HMAC SHA256 signatures, and complete pytest test cases.',
  },
  {
    title: 'Exponential Backoff & Retry',
    prompt:
      'Enhance src/math_utils.py with calculate_exponential_backoff function for handling 429 quota retries with jitter and full unit tests.',
  },
  {
    title: 'User Registration & Edge Cases',
    prompt:
      'Extend src/user_service.py with password hashing validation, duplicate email guards, and comprehensive pytest tests.',
  },
  {
    title: 'API Key Masking & Security',
    prompt:
      'Implement an API key format validator and masking utility in src/security.py with regex checks, sha256 hashing, and complete pytest tests.',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppRoute>(() => routeManager.getState().currentRoute);
  const [selectedTier, setSelectedTier] = useState<string>('tier_3');
  const [taskPrompt, setTaskPrompt] = useState<string>(PRESET_TASKS[0].prompt);

  // Synchronize routeManager navigation
  useEffect(() => {
    const unsubscribe = routeManager.subscribe((state) => {
      setActiveTab(state.currentRoute);
    });
    return () => unsubscribe();
  }, []);

  const handleTabChange = (tab: AppRoute) => {
    setActiveTab(tab);
    routeManager.navigate(tab);
  };

  // Multi-Provider state
  const [activeProvider, setActiveProvider] = useState<AIProviderId>('gemini');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  // Coding Agent Routing state (Google Jules)
  const [codingAgentOption, setCodingAgentOption] = useState<'none' | 'jules' | 'mock'>('none');
  const [githubRepo, setGithubRepo] = useState<string>('MohamedGH/agentTeam');
  const [githubBranch, setGithubBranch] = useState<string>('main');
  const [automationMode, setAutomationMode] = useState<'AUTO_CREATE_PR' | 'MANUAL'>('AUTO_CREATE_PR');

  // Multi-Agent Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Abort controller ref for in-flight cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Virtual Workspace State
  const [files, setFiles] = useState<Record<string, string>>({});
  const [gitStatus, setGitStatus] = useState<string>('');
  const [gitDiff, setGitDiff] = useState<string>('');

  // Quota Manager State
  const [quotaModels, setQuotaModels] = useState<Record<string, ModelQuotaStatus>>({});
  const [chosenModel, setChosenModel] = useState<string>('gemini-3.7-flash');

  // Elapsed timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 0.1);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  // Load initial workspace files, quota stats, and provider catalog
  const fetchWorkspace = async () => {
    try {
      const res = await fetch('/api/workspace/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || {});
        setGitStatus(data.gitStatus || '');
        setGitDiff(data.gitDiff || '');
      }
    } catch (e) {
      console.warn('Failed to load workspace files:', e);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers/list');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        if (data.activeProvider) {
          setActiveProvider(data.activeProvider);
        }
      }
    } catch (e) {
      console.warn('Failed to load providers list:', e);
    }
  };

  const handleSelectProvider = async (providerId: AIProviderId, model?: string) => {
    setActiveProvider(providerId);
    try {
      const res = await fetch('/api/providers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, model }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.activeModel) {
          setChosenModel(data.activeModel);
        }
      }
      await fetchQuotaStatus(selectedTier);
    } catch (e) {
      console.warn('Failed to select provider:', e);
    }
  };

  const fetchQuotaStatus = async (tier = selectedTier, refresh = false) => {
    try {
      const res = await fetch(`/api/quota/status?tier=${tier}${refresh ? '&refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setQuotaModels(data.models || {});
      }
    } catch (e) {
      console.warn('Failed to load quota status:', e);
    }
  };

  useEffect(() => {
    fetchWorkspace();
    fetchProviders();
    fetchQuotaStatus(selectedTier);
  }, [selectedTier]);

  // Handle aborting in-flight workflow run
  const handleAbortWorkflow = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  };

  // Run the Multi-Agent autonomous development workflow with Live SSE streaming
  const handleRunWorkflow = async () => {
    if (!taskPrompt.trim() || isRunning) return;

    setIsRunning(true);
    setElapsedSeconds(0);
    setErrorMessage(null);
    setFinalReport(null);
    setSteps([]);
    setCurrentPhase(1);
    setActiveAgent('manager');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestPayload = {
      prompt: taskPrompt.trim(),
      tier: selectedTier,
      provider: activeProvider,
      model: chosenModel,
      codingAgent: codingAgentOption !== 'none' ? codingAgentOption : undefined,
      repository: codingAgentOption !== 'none' ? githubRepo.trim() : undefined,
      branch: codingAgentOption !== 'none' ? githubBranch.trim() : undefined,
      automationMode: codingAgentOption !== 'none' ? automationMode : undefined,
      title: codingAgentOption !== 'none' ? `agentTeam: ${taskPrompt.slice(0, 45)}` : undefined,
    };

    try {
      // Attempt Server-Sent Events (SSE) streaming execution
      const streamRes = await fetch('/api/team/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const event = JSON.parse(jsonStr);
                if (event.type === 'step' && event.step) {
                  setSteps((prev) => [...prev, event.step]);
                  if (event.step.phase) setCurrentPhase(event.step.phase);
                  if (event.step.agent) setActiveAgent(event.step.agent);
                } else if (event.type === 'complete' && event.result) {
                  if (event.result.finalReport) {
                    setFinalReport(event.result.finalReport);
                  }
                  if (event.result.modelUsed) {
                    setChosenModel(event.result.modelUsed);
                  }
                  if (event.result.virtualFiles) {
                    setFiles(event.result.virtualFiles);
                  }
                } else if (event.type === 'error') {
                  setErrorMessage(event.error || 'Execution encountered an error');
                }
              } catch (e) {
                console.warn('Failed to parse SSE line:', line);
              }
            }
          }
        }
      } else {
        // Fallback to standard batch POST /api/team/run
        const res = await fetch('/api/team/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();
        if (data.steps && data.steps.length > 0) {
          setSteps(data.steps);
          const lastStep = data.steps[data.steps.length - 1];
          setCurrentPhase(lastStep.phase || 7);
          setActiveAgent(lastStep.agent || 'manager');
        }

        if (data.finalReport) {
          setFinalReport(data.finalReport);
        }

        if (data.modelUsed) {
          setChosenModel(data.modelUsed);
        }

        if (data.virtualFiles) {
          setFiles(data.virtualFiles);
        }
      }

      // Refresh workspace diffs & quota status
      await fetchWorkspace();
      await fetchQuotaStatus(selectedTier);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Error executing agent team workflow');
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleSaveFile = async (path: string, content: string) => {
    await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    await fetchWorkspace();
  };

  const handleDeleteFile = async (path: string) => {
    await fetch('/api/workspace/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    await fetchWorkspace();
  };

  const handleResetWorkspace = async () => {
    await fetch('/api/workspace/reset', { method: 'POST' });
    await fetchWorkspace();
  };

  const handleResetQuota = async (model?: string) => {
    await fetch('/api/quota/reset-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    await fetchQuotaStatus(selectedTier);
  };

  const handleClearMission = () => {
    setSteps([]);
    setFinalReport(null);
    setErrorMessage(null);
    setCurrentPhase(1);
    setActiveAgent('manager');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        selectedTier={selectedTier}
        setSelectedTier={setSelectedTier}
        isRunning={isRunning}
        totalModels={Object.keys(quotaModels).length}
        activeModel={chosenModel}
        activeProvider={activeProvider}
        providers={providers}
        onSelectProvider={handleSelectProvider}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-6">
        {/* VIEW 1: AGENT STUDIO */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* Mission Control / Task Bar */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    Task Dispatch & Autonomous Delegation
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {isRunning && (
                    <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-500/30 font-mono">
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                      Elapsed: {elapsedSeconds.toFixed(1)}s
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-slate-400">Provider:</span>
                    <strong className="text-blue-300 uppercase font-mono">{activeProvider}</strong>
                  </span>
                  <span className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-400">Routing:</span>
                    <strong className="font-mono text-emerald-300">{chosenModel}</strong>
                  </span>
                </div>
              </div>

              {/* Developer Delegation Routing Mode Selector */}
              <div className="mb-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="w-3.5 h-3.5 text-orange-400" />
                  <span className="font-semibold text-slate-300">Developer Delegation Target:</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCodingAgentOption('none')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      codingAgentOption === 'none'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Internal LLM Developer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodingAgentOption('jules')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      codingAgentOption === 'jules'
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'text-orange-400 hover:text-orange-300'
                    }`}
                  >
                    Google Jules (Cloud)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodingAgentOption('mock')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      codingAgentOption === 'mock'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mock Jules (Test)
                  </button>
                </div>
              </div>

              {/* Jules GitHub Repository & Branch Options when Jules is active */}
              {codingAgentOption !== 'none' && (
                <div className="mb-3 p-3 bg-orange-500/5 rounded-xl border border-orange-500/20 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                      <FolderGit2 className="w-3 h-3 text-orange-400" />
                      Repository
                    </label>
                    <input
                      type="text"
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      placeholder="owner/repo"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                      <GitBranch className="w-3 h-3 text-orange-400" />
                      Branch
                    </label>
                    <input
                      type="text"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      placeholder="main"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">Automation Mode</label>
                    <select
                      value={automationMode}
                      onChange={(e) => setAutomationMode(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="AUTO_CREATE_PR">AUTO_CREATE_PR (Create Pull Request)</option>
                      <option value="MANUAL">MANUAL (Branch patch only)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Task Input Box */}
              <div className="flex flex-col sm:flex-row items-stretch gap-3 mb-3">
                <input
                  id="task-input"
                  type="text"
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isRunning) {
                      handleRunWorkflow();
                    }
                  }}
                  placeholder="Describe your software requirement or bug to fix..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all font-sans"
                />

                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <button
                      id="btn-abort-team"
                      onClick={handleAbortWorkflow}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-500/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      Stop
                    </button>
                  ) : (
                    <button
                      id="btn-dispatch-team"
                      onClick={handleRunWorkflow}
                      disabled={!taskPrompt.trim()}
                      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ${
                        codingAgentOption !== 'none'
                          ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-500/20'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-white" />
                      Dispatch Team {codingAgentOption !== 'none' ? '(with Jules)' : ''}
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Preset Badges & Clear button */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Presets:
                  </span>
                  {PRESET_TASKS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setTaskPrompt(preset.prompt);
                        if (preset.title.includes('Jules')) {
                          setCodingAgentOption('jules');
                        }
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all text-left truncate max-w-xs cursor-pointer"
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>

                {steps.length > 0 && !isRunning && (
                  <button
                    onClick={handleClearMission}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear Mission Output
                  </button>
                )}
              </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-xs text-rose-400 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <strong className="block font-bold">Execution Error:</strong>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* 4-Agent Team Visualizer & Phase Ribbon */}
            <AgentVisualizer
              currentPhase={currentPhase}
              activeAgent={activeAgent}
              isRunning={isRunning}
              steps={steps}
            />

            {/* Final Report Card when complete */}
            {finalReport && (
              <FinalReportCard
                report={finalReport}
                onViewFiles={() => handleTabChange('workspace')}
              />
            )}

            {/* Step-by-Step Activity & Reasoning Timeline */}
            <ExecutionTimeline steps={steps} isRunning={isRunning} />
          </div>
        )}

        {/* VIEW 2: VIRTUAL WORKSPACE EXPLORER */}
        {activeTab === 'workspace' && (
          <WorkspaceExplorer
            files={files}
            onRefresh={fetchWorkspace}
            onSaveFile={handleSaveFile}
            onDeleteFile={handleDeleteFile}
            onResetWorkspace={handleResetWorkspace}
            gitStatus={gitStatus}
            gitDiff={gitDiff}
          />
        )}

        {/* VIEW 3: QUOTA MANAGER & CAPACITY MATRIX */}
        {activeTab === 'quota' && (
          <QuotaDashboard
            models={quotaModels}
            tier={selectedTier}
            onTierChange={setSelectedTier}
            onResetQuota={handleResetQuota}
            onForceRefresh={() => fetchQuotaStatus(selectedTier, true)}
            providers={providers}
            activeProvider={activeProvider}
            onSelectProvider={handleSelectProvider}
          />
        )}

        {/* VIEW 4: TEAM ROLES & SPECIFICATION */}
        {activeTab === 'roles' && <RolesGuide />}

        {/* VIEW 5: GOOGLE JULES CODING AGENT DASHBOARD */}
        {activeTab === 'jules' && <JulesDashboard />}

        {/* VIEW 6: SELF-IMPROVEMENT AUTONOMOUS ENGINE */}
        {activeTab === 'auto-improve' && <SelfImprovementDashboard />}

        {/* VIEW 7: ADAPTIVE MULTI-LLM EMPIRICAL ROUTING */}
        {activeTab === 'adaptive-llm' && <AdaptiveLLMDashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>agentTeam • Autonomous Software Engineering Orchestrator</span>
          <span className="font-mono text-[11px] text-slate-600">
            Node.js 22 + TypeScript + Express + React 19 + Tailwind CSS + Google Jules Coding Agent + Multi-AI Providers
          </span>
        </div>
      </footer>
    </div>
  );
}
