import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DashboardPage } from './components/pages/DashboardPage';
import { BuildPage } from './components/pages/BuildPage';
import { IntelligencePage } from './components/pages/IntelligencePage';
import { SystemPage } from './components/pages/SystemPage';
import { ActivityPage } from './components/pages/ActivityPage';
import { ExecutionStatusBanner } from './components/ExecutionStatusBanner';
import { GlobalActivityCenter } from './components/GlobalActivityCenter';
import { AgentStep, ModelQuotaStatus, AIProviderId, ProviderInfo } from './types';
import { routeManager, AppRoute } from './managers/routeManager';
import { workflowStateManager } from './managers/workflowStateManager';
import { errorManager } from './managers/errorManager';
import { useWorkflowState } from './managers/useWorkflowState';
import { useDeliveryState } from './managers/useDeliveryState';
import { useSelfImprovementState } from './managers/useSelfImprovementState';
import { useJulesState } from './managers/useJulesState';
import { apiFetch } from './utils/apiFetch';

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

  const handleTabChange = (tab: AppRoute, params?: Record<string, string>) => {
    setActiveTab(tab);
    routeManager.navigate(tab, params);
  };

  // Multi-Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

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

  // Global Activity Center Modal State
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
  const primaryPage = routeManager.getPrimaryPage(activeTab);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* Persistent Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => handleTabChange(tab)}
        isRunning={isRunning}
        onOpenActivityCenter={() => setIsActivityCenterOpen(true)}
        activeActivitiesCount={
          (executionState === 'RUNNING' ? 1 : 0) +
          (delivery.pushStatus === 'RUNNING' ? 1 : 0) +
          (delivery.ciStatus === 'RUNNING' || delivery.ciStatus === 'QUEUED' || delivery.ciStatus === 'WAITING_WORKFLOW' ? 1 : 0) +
          (selfImprovement.isRunning ? 1 : 0) +
          (jules.isStartingSession || (jules.activeSession && ['IN_PROGRESS', 'QUEUED', 'PLANNING'].includes(jules.activeSession.state)) ? 1 : 0)
        }
      />

      {/* Persistent Status Banner across screens when running */}
      {primaryPage !== 'build' && executionState === 'RUNNING' && (
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
            onNavigateBuild={() => handleTabChange('build')}
          />
        </div>
      )}

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:px-6 py-6 space-y-6">
        {/* PAGE 1: DASHBOARD */}
        {primaryPage === 'dashboard' && (
          <DashboardPage
            workflow={workflowState}
            delivery={delivery}
            selfImprovement={selfImprovement}
            jules={jules}
            taskPrompt={taskPrompt}
            setTaskPrompt={setTaskPrompt}
            onRunWorkflow={handleRunWorkflow}
            onAbortWorkflow={handleAbortWorkflow}
            onResetWorkflow={handleResetMission}
            onNavigate={(route, params) => handleTabChange(route, params)}
            activeProvider={activeProvider}
            chosenModel={chosenModel}
            providers={providers}
            selectedTier={selectedTier}
          />
        )}

        {/* PAGE 2: BUILD & DELIVERY */}
        {primaryPage === 'build' && (
          <BuildPage
            workflow={workflowState}
            delivery={delivery}
            onRefreshCi={() => delivery.fetchCiRuns()}
            taskPrompt={taskPrompt}
            setTaskPrompt={setTaskPrompt}
            onRunWorkflow={handleRunWorkflow}
            onAbortWorkflow={handleAbortWorkflow}
            onResetWorkflow={handleResetMission}
            activeProvider={activeProvider}
            chosenModel={chosenModel}
            providers={providers}
            selectedTier={selectedTier}
            files={files}
            gitStatus={gitStatus}
            gitDiff={gitDiff}
            onFetchWorkspace={fetchWorkspace}
            onSaveFile={handleSaveFile}
            onDeleteFile={handleDeleteFile}
            onResetWorkspace={handleResetWorkspace}
            codingAgentOption={codingAgentOption}
            setCodingAgentOption={setCodingAgentOption}
            githubRepo={githubRepo}
            setGithubRepo={setGithubRepo}
            githubBranch={githubBranch}
            setGithubBranch={setGithubBranch}
            automationMode={automationMode}
            setAutomationMode={setAutomationMode}
            initialSubTab={routeManager.getState().subTab}
          />
        )}

        {/* PAGE 3: INTELLIGENCE */}
        {primaryPage === 'intelligence' && (
          <IntelligencePage
            chosenModel={chosenModel}
            activeProvider={activeProvider}
            jules={jules}
            selfImprovement={selfImprovement}
            providers={providers}
            initialSubTab={routeManager.getState().subTab}
          />
        )}

        {/* PAGE 4: SYSTEM */}
        {primaryPage === 'system' && (
          <SystemPage
            quotaModels={quotaModels}
            selectedTier={selectedTier}
            setSelectedTier={setSelectedTier}
            onResetQuota={handleResetQuota}
            onForceRefreshQuota={() => fetchQuotaStatus(selectedTier, true)}
            providers={providers}
            activeProvider={activeProvider}
            onSelectProvider={handleSelectProvider}
            initialSubTab={routeManager.getState().subTab}
          />
        )}

        {/* PAGE 5: ACTIVITY */}
        {primaryPage === 'activity' && (
          <ActivityPage
            onNavigate={(route, params) => handleTabChange(route, params)}
          />
        )}
      </main>

      {/* Global Live Activity Center Modal (Quick drawer accessible everywhere) */}
      <GlobalActivityCenter
        isOpen={isActivityCenterOpen}
        onClose={() => setIsActivityCenterOpen(false)}
        onNavigate={(tab) => handleTabChange(tab as any)}
      />

      {/* Clean Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>agentTeam • Autonomous Multi-Agent Software Engineering</span>
          <span className="font-mono text-[11px] text-slate-400">
            ACTION → ÉTAT → RÉSULTAT → DÉTAILS
          </span>
        </div>
      </footer>
    </div>
  );
}
