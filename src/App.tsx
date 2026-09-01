import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AgentVisualizer } from './components/AgentVisualizer';
import { ExecutionTimeline } from './components/ExecutionTimeline';
import { FinalReportCard } from './components/FinalReportCard';
import { WorkspaceExplorer } from './components/WorkspaceExplorer';
import { QuotaDashboard } from './components/QuotaDashboard';
import { RolesGuide } from './components/RolesGuide';
import { AgentStep, FinalReport, AgentRole, ModelQuotaStatus, AIProviderId, ProviderInfo } from './types';
import { Play, Sparkles, AlertTriangle, RefreshCw, Cpu, Layers, CheckCircle2, Globe } from 'lucide-react';

const PRESET_TASKS = [
  {
    title: 'JWT Auth & Rate Limiter',
    prompt: 'Implement a secure JWT token generator and validator in src/auth.py with expiration, HMAC SHA256 signatures, and complete pytest test cases.',
  },
  {
    title: 'Exponential Backoff & Retry',
    prompt: 'Enhance src/math_utils.py with calculate_exponential_backoff function for handling 429 quota retries with jitter and full unit tests.',
  },
  {
    title: 'User Registration & Edge Cases',
    prompt: 'Extend src/user_service.py with password hashing validation, duplicate email guards, and comprehensive pytest tests.',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'workspace' | 'quota' | 'roles'>('studio');
  const [selectedTier, setSelectedTier] = useState<string>('tier_3');
  const [taskPrompt, setTaskPrompt] = useState<string>(PRESET_TASKS[0].prompt);

  // Multi-Provider state
  const [activeProvider, setActiveProvider] = useState<AIProviderId>('gemini');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  // Multi-Agent Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Virtual Workspace State
  const [files, setFiles] = useState<Record<string, string>>({});
  const [gitStatus, setGitStatus] = useState<string>('');
  const [gitDiff, setGitDiff] = useState<string>('');

  // Quota Manager State
  const [quotaModels, setQuotaModels] = useState<Record<string, ModelQuotaStatus>>({});
  const [chosenModel, setChosenModel] = useState<string>('gemini-3.7-flash');

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

  // Run the Multi-Agent autonomous development workflow
  const handleRunWorkflow = async () => {
    if (!taskPrompt.trim() || isRunning) return;

    setIsRunning(true);
    setErrorMessage(null);
    setFinalReport(null);
    setSteps([]);
    setCurrentPhase(1);
    setActiveAgent('manager');

    try {
      const res = await fetch('/api/team/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: taskPrompt.trim(),
          tier: selectedTier,
          provider: activeProvider,
          model: chosenModel,
        }),
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

      // Refresh workspace diffs & quota
      await fetchWorkspace();
      await fetchQuotaStatus(selectedTier);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error executing agent team workflow');
    } finally {
      setIsRunning(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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

                <button
                  id="btn-dispatch-team"
                  onClick={handleRunWorkflow}
                  disabled={isRunning || !taskPrompt.trim()}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Team Working...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      Dispatch Team
                    </>
                  )}
                </button>
              </div>

              {/* Quick Preset Badges */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Presets:
                </span>
                {PRESET_TASKS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setTaskPrompt(preset.prompt)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all text-left truncate max-w-xs cursor-pointer"
                  >
                    {preset.title}
                  </button>
                ))}
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
                onViewFiles={() => setActiveTab('workspace')}
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>agentTeam • Autonomous Software Engineering Orchestrator</span>
          <span className="font-mono text-[11px] text-slate-600">
            Node.js 22 + TypeScript + Express + React 19 + Tailwind CSS + Multi-Provider AI (Gemini, OpenAI, Claude, Groq, DeepSeek, Ollama)
          </span>
        </div>
      </footer>
    </div>
  );
}

