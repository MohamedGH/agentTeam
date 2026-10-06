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
import { GitHubSettingsModal } from './components/GitHubSettingsModal';
import { ExecutionStatusBanner } from './components/ExecutionStatusBanner';
import { ActionableErrorCard } from './components/ActionableErrorCard';
import { GlobalActivityCenter } from './components/GlobalActivityCenter';
import { AgentStep, FinalReport, AgentRole, ModelQuotaStatus, AIProviderId, ProviderInfo } from './types';
import { routeManager, AppRoute } from './managers/routeManager';
import { workflowStateManager } from './managers/workflowStateManager';
import { errorManager } from './managers/errorManager';
import { useWorkflowState } from './managers/useWorkflowState';
import { useDeliveryState } from './managers/useDeliveryState';
import { useSelfImprovementState } from './managers/useSelfImprovementState';
import { useJulesState } from './managers/useJulesState';
import { apiFetch } from './utils/apiFetch';
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
  ChevronDown,
  ChevronUp,
  Settings2,
  Send,
  Loader2,
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

  // Centralized Workflow Execution State via Manager
  const workflowState = useWorkflowState();
  const {
    executionState,
    activeAgent,
    currentPhase,
    chosenModel,
    activeProvider,
    elapsedSeconds,
    steps,
    finalReport,
    errorMessage,
  } = workflowState;

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
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  // Advanced Options Drawer toggle (collapsed by default)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // Coding Agent Routing state (Google Jules)
  const [codingAgentOption, setCodingAgentOption] = useState<'none' | 'jules' | 'mock'>('none');
  const [githubRepo, setGithubRepo] = useState<string>('MohamedGH/agentTeam');
  const [githubBranch, setGithubBranch] = useState<string>('main');
  const [automationMode, setAutomationMode] = useState<'AUTO_CREATE_PR' | 'MANUAL'>('AUTO_CREATE_PR');

  // Abort controller ref for in-flight cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Virtual Workspace State
  const [files, setFiles] = useState<Record<string, string>>({});
  const [gitStatus, setGitStatus] = useState<string>('');
  const [gitDiff, setGitDiff] = useState<string>('');

  // Centralized Delivery, Self-Improvement and Jules States
  const delivery = useDeliveryState();
  const selfImprovement = useSelfImprovementState();
  const jules = useJulesState();

  // Quota Manager State
  const [quotaModels, setQuotaModels] = useState<Record<string, ModelQuotaStatus>>({});
  const [isResettingQuota, setIsResettingQuota] = useState<boolean>(false);
  const [quotaResetError, setQuotaResetError] = useState<string | null>(null);

  // Global Activity Center Toggle State
  const [isActivityCenterOpen, setIsActivityCenterOpen] = useState<boolean>(false);

  // Load initial workspace files, quota stats, and provider catalog
  const fetchWorkspace = async () => {
    try {
      const res = await apiFetch('/api/workspace/files');
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
      const res = await apiFetch('/api/providers/list');
      if (res.ok) {
        const data = await res.json();
        const provs = data.providers || [];
        setProviders(provs);
        if (data.activeProvider) {
          const activeProvInfo = provs.find((p: ProviderInfo) => p.id === data.activeProvider);
          const currentModel = workflowStateManager.getState().chosenModel;
          const isCurrentModelValid = activeProvInfo?.models.some((m: any) => m.name === currentModel);
          const validatedModel = isCurrentModelValid ? currentModel : activeProvInfo?.defaultModel || currentModel;
          workflowStateManager.setModelAndProvider(validatedModel, data.activeProvider);
        }
      }
    } catch (e) {
      console.warn('Failed to load providers list:', e);
    }
  };

  const handleSelectProvider = async (providerId: AIProviderId, model?: string) => {
    try {
      const targetProvider = providers.find((p) => p.id === providerId);
      const isModelValid = targetProvider && model ? targetProvider.models.some((m) => m.name === model) : false;
      const targetModel = isModelValid ? model : (targetProvider ? targetProvider.defaultModel : undefined);

      const res = await apiFetch('/api/providers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, model: targetModel }),
      });
      if (res.ok) {
        const data = await res.json();
        const effectiveProvider = (data.activeProvider || data.provider || providerId) as AIProviderId;
        const effectiveModel = data.model || targetModel || targetProvider?.defaultModel || chosenModel;
        workflowStateManager.setModelAndProvider(effectiveModel, effectiveProvider);
      }
      await fetchProviders();
      await fetchQuotaStatus(selectedTier);
    } catch (e: any) {
      console.warn('Failed to select provider:', e);
      errorManager.parseError(e, 'Provider selection failure');
    }
  };

  const fetchQuotaStatus = async (tier = selectedTier, refresh = false) => {
    try {
      const res = await apiFetch(`/api/quota/status?tier=${tier}${refresh ? '&refresh=true' : ''}`);
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
    delivery.fetchCiRuns();
  }, [selectedTier]);

  // Handle aborting in-flight workflow run
  const handleAbortWorkflow = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    workflowStateManager.cancelExecution();
  };

  // Run the Multi-Agent autonomous development workflow with Live SSE streaming
  const handleRunWorkflow = async () => {
    if (!taskPrompt.trim() || executionState === 'RUNNING') return;

    // Start execution via state manager
    workflowStateManager.startExecution(chosenModel, activeProvider);

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

    let explicitCompletionReceived = false;

    try {
      // Attempt Server-Sent Events (SSE) streaming execution
      const streamRes = await apiFetch('/api/team/run-stream', {
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
                  workflowStateManager.addStep(event.step);
                } else if (event.type === 'complete' && event.result) {
                  if (event.result.finalReport) {
                    explicitCompletionReceived = true;
                    workflowStateManager.completeExecution(event.result.finalReport);
                  }
                  if (event.result.virtualFiles) {
                    setFiles(event.result.virtualFiles);
                  }
                } else if (event.type === 'error') {
                  workflowStateManager.failExecution(
                    event.error || 'Une erreur est survenue pendant l’exécution de l’équipe d’agents.'
                  );
                }
              } catch (e) {
                console.warn('Failed to parse SSE line:', line);
              }
            }
          }
        }

        // PRIORITÉ 1: If stream closed without explicit complete event
        if (!explicitCompletionReceived && workflowStateManager.getState().executionState === 'RUNNING') {
          workflowStateManager.handleStreamAborted();
        }
      } else {
        // Fallback to standard batch POST /api/team/run
        const res = await apiFetch('/api/team/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Erreur HTTP ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();
        if (data.steps && data.steps.length > 0) {
          data.steps.forEach((st: AgentStep) => workflowStateManager.addStep(st));
        }

        if (data.virtualFiles) {
          setFiles(data.virtualFiles);
        }

        if (data.finalReport && typeof data.finalReport === 'object') {
          workflowStateManager.completeExecution(data.finalReport);
        } else {
          workflowStateManager.failExecution(
            data.error || 'Workflow terminé sans résultat ni rapport final valide.'
          );
        }
      }

      // Refresh workspace diffs & quota status
      await fetchWorkspace();
      await fetchQuotaStatus(selectedTier);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        workflowStateManager.cancelExecution();
      } else {
        workflowStateManager.failExecution(err.message || 'Erreur lors de l’exécution du workflow agentTeam');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSaveFile = async (path: string, content: string) => {
    await apiFetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    await fetchWorkspace();
  };

  const handleDeleteFile = async (path: string) => {
    await apiFetch('/api/workspace/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    await fetchWorkspace();
  };

  const handleResetWorkspace = async () => {
    await apiFetch('/api/workspace/reset', { method: 'POST' });
    await fetchWorkspace();
  };

  const handleResetQuota = async (model?: string) => {
    setIsResettingQuota(true);
    setQuotaResetError(null);
    try {
      const res = await apiFetch('/api/quota/reset-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation du quota');
      }
      await fetchQuotaStatus(selectedTier, true);
    } catch (err: any) {
      console.error('Reset quota failed:', err);
      setQuotaResetError(err.message || 'Échec de réinitialisation');
      errorManager.parseError(err, 'Quota reset failure');
      throw err;
    } finally {
      setIsResettingQuota(false);
    }
  };

  const handleResetMission = () => {
    workflowStateManager.reset();
  };

  const isRunning = executionState === 'RUNNING';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* Top Header with 3-Category Hierarchy */}
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
        onOpenActivityCenter={() => setIsActivityCenterOpen(true)}
        activeActivitiesCount={
          (executionState === 'RUNNING' ? 1 : 0) +
          (delivery.pushStatus === 'RUNNING' ? 1 : 0) +
          (delivery.ciStatus === 'RUNNING' || delivery.ciStatus === 'QUEUED' || delivery.ciStatus === 'WAITING_WORKFLOW' ? 1 : 0) +
          (selfImprovement.isRunning ? 1 : 0) +
          (jules.isStartingSession || (jules.activeSession && ['IN_PROGRESS', 'QUEUED', 'PLANNING'].includes(jules.activeSession.state)) ? 1 : 0)
        }
      />

      {/* PRIORITÉ 3: PERSISTENT STATUS BAR ACROSS OTHER SCREENS */}
      {activeTab !== 'studio' && executionState !== 'IDLE' && (
        <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 pt-4">
          <ExecutionStatusBanner
            executionState={executionState}
            activeAgent={activeAgent}
            currentPhase={currentPhase}
            chosenModel={chosenModel}
            activeProvider={activeProvider}
            elapsedSeconds={elapsedSeconds}
            finalReport={finalReport}
            errorMessage={errorMessage}
            stepsCount={steps.length}
            onStop={isRunning ? handleAbortWorkflow : undefined}
            onReset={handleResetMission}
          />
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-6">
        {/* VIEW 1: AGENT STUDIO */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* HERO PROMPT SECTION : PRIORITÉ À L'ACTION */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Sparkles className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                      Que veux-tu construire ou corriger ?
                    </h2>
                    <p className="text-xs text-slate-400">
                      L'équipe autonome (Manager, Developer, Tester, Reviewer) va analyser, coder, valider et auditer votre besoin.
                    </p>
                  </div>
                </div>

                {/* Model / Provider Pill */}
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono self-start md:self-auto">
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-blue-400" />
                    <span className="text-slate-500">Provider :</span>
                    <strong className="text-blue-300 uppercase">{activeProvider}</strong>
                  </span>
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    <span className="text-slate-500">Modèle :</span>
                    <strong className="text-emerald-300 truncate max-w-[130px]">{chosenModel}</strong>
                  </span>
                </div>
              </div>

              {/* Main Input & Primary Action Button */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <div className="relative flex-1">
                    <textarea
                      id="task-input"
                      rows={2}
                      value={taskPrompt}
                      onChange={(e) => setTaskPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isRunning) {
                          e.preventDefault();
                          handleRunWorkflow();
                        }
                      }}
                      placeholder="Ex: Implémenter un système d'authentification JWT avec tests pytest et gestion des erreurs 429..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all resize-none font-sans"
                    />
                    <span className="hidden sm:inline-block absolute right-3 bottom-2.5 text-[10px] text-slate-400 font-mono">
                      ⌘ + Entrée pour lancer
                    </span>
                  </div>

                  <div className="flex sm:flex-col justify-end gap-2 flex-shrink-0">
                    {isRunning ? (
                      <button
                        id="btn-abort-team"
                        type="button"
                        onClick={handleAbortWorkflow}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-500/20 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Square className="w-4 h-4 fill-white" />
                        Arrêter l'exécution
                      </button>
                    ) : (
                      <button
                        id="btn-dispatch-team"
                        type="button"
                        onClick={handleRunWorkflow}
                        disabled={!taskPrompt.trim()}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-white text-xs sm:text-sm font-bold shadow-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                          codingAgentOption !== 'none'
                            ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-500/20'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-white" />
                        Lancer le workflow {codingAgentOption !== 'none' ? '(avec Jules)' : ''}
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Presets Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Exemples rapides :
                    </span>
                    {PRESET_TASKS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTaskPrompt(preset.prompt);
                          if (preset.title.includes('Jules')) {
                            setCodingAgentOption('jules');
                          }
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all text-left truncate max-w-[200px] cursor-pointer"
                      >
                        {preset.title}
                      </button>
                    ))}
                  </div>

                  {steps.length > 0 && !isRunning && (
                    <button
                      type="button"
                      onClick={handleResetMission}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Effacer les résultats
                    </button>
                  )}
                </div>
              </div>

              {/* COLLAPSIBLE SECTION: OPTIONS AVANCÉES & DÉLÉGATION */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-slate-200 py-1 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                    Options avancées (Délégation Jules, Dépôt GitHub, Branche & Quotas)
                    {codingAgentOption !== 'none' && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono">
                        Délégation : {codingAgentOption}
                      </span>
                    )}
                  </span>
                  {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAdvancedOptions && (
                  <div className="mt-3 p-4 bg-slate-950/90 rounded-xl border border-slate-800 space-y-4 text-xs">
                    {/* Delegation Selector */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                        Cible de délégation Developer
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('none')}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            codingAgentOption === 'none'
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <strong className="block text-slate-200">Developer Interne LLM</strong>
                          <span className="text-[11px] text-slate-400">Modèles orchestrés en mémoire</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('jules')}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            codingAgentOption === 'jules'
                              ? 'bg-orange-600/20 border-orange-500/50 text-orange-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-orange-300'
                          }`}
                        >
                          <strong className="block text-orange-300">Google Jules (Cloud)</strong>
                          <span className="text-[11px] text-slate-400">Agent cloud GitHub & PR auto</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('mock')}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            codingAgentOption === 'mock'
                              ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <strong className="block text-purple-300">Mock Jules (Test Hermétique)</strong>
                          <span className="text-[11px] text-slate-400">Simulation locale isolée</span>
                        </button>
                      </div>
                    </div>

                    {/* Jules GitHub Parameters (when delegation active) */}
                    {codingAgentOption !== 'none' && (
                      <div className="p-3 bg-orange-500/5 rounded-xl border border-orange-500/20 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                            <FolderGit2 className="w-3 h-3 text-orange-400" />
                            Dépôt GitHub
                          </label>
                          <input
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="owner/repo"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                            <GitBranch className="w-3 h-3 text-orange-400" />
                            Branche cible
                          </label>
                          <input
                            type="text"
                            value={githubBranch}
                            onChange={(e) => setGithubBranch(e.target.value)}
                            placeholder="main"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-300">Mode d'automatisation</label>
                          <select
                            value={automationMode}
                            onChange={(e) => setAutomationMode(e.target.value as any)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500 cursor-pointer"
                          >
                            <option value="AUTO_CREATE_PR">AUTO_CREATE_PR (Créer une Pull Request)</option>
                            <option value="MANUAL">MANUAL (Créer branche uniquement)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* LIVE EXECUTION STATUS BANNER */}
            <ExecutionStatusBanner
              executionState={executionState}
              activeAgent={activeAgent}
              currentPhase={currentPhase}
              chosenModel={chosenModel}
              activeProvider={activeProvider}
              elapsedSeconds={elapsedSeconds}
              finalReport={finalReport}
              errorMessage={errorMessage}
              stepsCount={steps.length}
              onStop={isRunning ? handleAbortWorkflow : undefined}
              onReset={handleResetMission}
            />

            {/* ACTIONABLE ERROR CARD (When Error Occurs) */}
            {errorMessage && (
              <ActionableErrorCard
                title="Échec de l'exécution du workflow"
                error={errorMessage}
                onRetry={handleRunWorkflow}
                onNavigateToConfig={() => handleTabChange('github-settings')}
                configLabel="Configurer les accès GitHub & Tokens"
              />
            )}

            {/* 4-Agent Team Visualizer & Phase Ribbon */}
            <AgentVisualizer
              currentPhase={currentPhase}
              activeAgent={activeAgent}
              isRunning={isRunning}
              steps={steps as AgentStep[]}
            />

            {/* Final Report Card when complete */}
            {finalReport && (
              <FinalReportCard
                report={finalReport}
                onViewFiles={() => handleTabChange('workspace')}
              />
            )}

            {/* Step-by-Step Activity & Reasoning Timeline */}
            <ExecutionTimeline steps={steps as AgentStep[]} isRunning={isRunning} />
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

        {/* VIEW 8: GITHUB & CI SETTINGS */}
        {activeTab === 'github-settings' && <GitHubSettingsModal />}
      </main>

      {/* Global Activity Center Modal */}
      <GlobalActivityCenter
        isOpen={isActivityCenterOpen}
        onClose={() => setIsActivityCenterOpen(false)}
        onNavigate={(tab) => handleTabChange(tab as any)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>agentTeam • Autonomous Software Engineering Orchestrator</span>
          <span className="font-mono text-[11px] text-slate-400">
            Node.js 22 + TypeScript + Express + React 19 + Tailwind CSS + Google Jules + Multi-AI Providers
          </span>
        </div>
      </footer>
    </div>
  );
}
