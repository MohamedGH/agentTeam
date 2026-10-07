import React, { useState } from 'react';
import {
  Layers,
  Sparkles,
  GitCommit,
  GitPullRequest,
  FolderTree,
  Activity,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FolderGit2,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Settings2,
  Code2,
  Check,
} from 'lucide-react';
import {
  StatusBadge,
  ProgressState,
  PipelineStep,
  ErrorState,
  ResultBanner,
  EmptyState,
  DetailPanel,
} from '../ui';
import { AgentVisualizer } from '../AgentVisualizer';
import { ExecutionTimeline } from '../ExecutionTimeline';
import { FinalReportCard } from '../FinalReportCard';
import { WorkspaceExplorer } from '../WorkspaceExplorer';
import { CIStatusDashboard } from '../CIStatusDashboard';
import { WorkflowState } from '../../managers/workflowStateManager';
import { DeliveryState } from '../../managers/deliveryStateManager';
import { AgentStep, AIProviderId, ProviderInfo } from '../../types';

interface BuildPageProps {
  workflow: WorkflowState;
  delivery: DeliveryState;
  onRefreshCi?: () => void;
  taskPrompt: string;
  setTaskPrompt: (prompt: string) => void;
  onRunWorkflow: () => void;
  onAbortWorkflow: () => void;
  onResetWorkflow: () => void;
  activeProvider: AIProviderId;
  chosenModel: string;
  providers: ProviderInfo[];
  selectedTier: string;
  // Workspace controls
  files: Record<string, string>;
  gitStatus: string;
  gitDiff: string;
  onFetchWorkspace: () => Promise<void>;
  onSaveFile: (path: string, content: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  // Coding Agent Options
  codingAgentOption: 'none' | 'jules' | 'mock';
  setCodingAgentOption: (opt: 'none' | 'jules' | 'mock') => void;
  githubRepo: string;
  setGithubRepo: (repo: string) => void;
  githubBranch: string;
  setGithubBranch: (branch: string) => void;
  automationMode: 'AUTO_CREATE_PR' | 'MANUAL';
  setAutomationMode: (mode: 'AUTO_CREATE_PR' | 'MANUAL') => void;
  initialSubTab?: string;
}

export const BuildPage: React.FC<BuildPageProps> = ({
  workflow,
  delivery,
  onRefreshCi,
  taskPrompt,
  setTaskPrompt,
  onRunWorkflow,
  onAbortWorkflow,
  onResetWorkflow,
  activeProvider,
  chosenModel,
  files,
  gitStatus,
  gitDiff,
  onFetchWorkspace,
  onSaveFile,
  onDeleteFile,
  onResetWorkspace,
  codingAgentOption,
  setCodingAgentOption,
  githubRepo,
  setGithubRepo,
  githubBranch,
  setGithubBranch,
  automationMode,
  setAutomationMode,
  initialSubTab = 'pipeline',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'workspace' | 'ci'>(
    initialSubTab === 'workspace' ? 'workspace' : initialSubTab === 'ci' ? 'ci' : 'pipeline'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isRunning = workflow.executionState === 'RUNNING';
  const hasCompleted = workflow.executionState === 'COMPLETED';
  const hasFailed = workflow.executionState === 'FAILED';

  // Human 5-Step Pipeline (Analyse → Développement → Tests → Revue → Livraison)
  const pipelineSteps: PipelineStep[] = [
    {
      id: 'step-plan',
      label: '1. Analyse & Plan',
      status:
        workflow.currentPhase > 1 || hasCompleted
          ? 'COMPLETED'
          : workflow.currentPhase === 1 && isRunning
          ? 'RUNNING'
          : hasFailed && workflow.currentPhase === 1
          ? 'FAILED'
          : 'PENDING',
      detail: workflow.currentPhase >= 1 ? 'Manager' : undefined,
    },
    {
      id: 'step-dev',
      label: '2. Développement',
      status:
        workflow.currentPhase > 3 || hasCompleted
          ? 'COMPLETED'
          : (workflow.currentPhase === 2 || workflow.currentPhase === 3) && isRunning
          ? 'RUNNING'
          : hasFailed && (workflow.currentPhase === 2 || workflow.currentPhase === 3)
          ? 'FAILED'
          : 'PENDING',
      detail: codingAgentOption !== 'none' ? `Agent ${codingAgentOption}` : 'Developer',
    },
    {
      id: 'step-qa',
      label: '3. Tests QA',
      status:
        workflow.currentPhase > 5 || hasCompleted
          ? 'COMPLETED'
          : (workflow.currentPhase === 4 || workflow.currentPhase === 5) && isRunning
          ? 'RUNNING'
          : hasFailed && (workflow.currentPhase === 4 || workflow.currentPhase === 5)
          ? 'FAILED'
          : 'PENDING',
      detail: 'Tester QA',
    },
    {
      id: 'step-review',
      label: '4. Revue & Sécurité',
      status:
        workflow.currentPhase > 6 || hasCompleted
          ? 'COMPLETED'
          : workflow.currentPhase === 6 && isRunning
          ? 'RUNNING'
          : hasFailed && workflow.currentPhase === 6
          ? 'FAILED'
          : 'PENDING',
      detail: 'Reviewer',
    },
    {
      id: 'step-delivery',
      label: '5. Livraison CI',
      status:
        delivery.ciStatus === 'TERMINAL_SUCCESS'
          ? 'COMPLETED'
          : delivery.ciStatus === 'TERMINAL_FAILURE'
          ? 'FAILED'
          : delivery.ciStatus === 'RUNNING' || (hasCompleted && delivery.trackedSha)
          ? 'RUNNING'
          : hasCompleted
          ? 'COMPLETED'
          : 'PENDING',
      detail: delivery.trackedSha ? `SHA ${delivery.trackedSha.slice(0, 7)}` : 'GitHub Actions',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. VIEW HEADER WITH 3 SUB-DOMAINS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">Build & Livraison</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Suivi de l'équipe de développement, espace de code virtuel et validation GitHub CI.
          </p>
        </div>

        {/* 3 Domain Tabs */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('pipeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'pipeline'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Pipeline & Agents</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('workspace')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'workspace'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Code & Fichiers ({Object.keys(files).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ci')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'ci'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Livraison CI</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: PIPELINE & AGENTS */}
      {activeSubTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Visual Step-by-Step Pipeline */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block px-1">
              Progression de la Mission
            </span>
            <ProgressState steps={pipelineSteps} />
          </div>

          {/* Prompt & Execution Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-100">Consigne de Développement</h3>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Modèle : <strong className="text-emerald-400">{chosenModel}</strong>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <textarea
                  rows={2}
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Décrivez la fonctionnalité ou correction à effectuer..."
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition resize-none"
                />

                <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={onAbortWorkflow}
                      className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>Arrêter</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onRunWorkflow}
                      disabled={!taskPrompt.trim()}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Lancer la mission</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Delegation Options (Collapsible) */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-slate-200 py-1 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Délégation d'Agent (Google Jules / Dépôt GitHub)</span>
                    {codingAgentOption !== 'none' && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-300 font-mono">
                        Délégation : {codingAgentOption}
                      </span>
                    )}
                  </span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4 text-xs">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block mb-1.5">
                        Cible du Developer
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('none')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                            codingAgentOption === 'none'
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <strong className="block text-slate-200">Developer Interne</strong>
                          <span className="text-[10px] text-slate-400">Modèles orchestrés en mémoire</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('jules')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                            codingAgentOption === 'jules'
                              ? 'bg-orange-600/20 border-orange-500/50 text-orange-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <strong className="block text-orange-300">Google Jules (Cloud)</strong>
                          <span className="text-[10px] text-slate-400">Agent GitHub & PR auto</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCodingAgentOption('mock')}
                          className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                            codingAgentOption === 'mock'
                              ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <strong className="block text-purple-300">Mock Jules</strong>
                          <span className="text-[10px] text-slate-400">Test hermétique local</span>
                        </button>
                      </div>
                    </div>

                    {codingAgentOption !== 'none' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-slate-400">Dépôt GitHub</label>
                          <input
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-slate-400">Branche cible</label>
                          <input
                            type="text"
                            value={githubBranch}
                            onChange={(e) => setGithubBranch(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actionable Error Card (When Failure occurs) */}
          {hasFailed && workflow.errorMessage && (
            <ErrorState
              title="La mission n’a pas pu être validée"
              cause={workflow.errorMessage}
              impact="Le Quality Gate a interrompu le cycle. Le code reste dans le workspace sans commit."
              recommendation="Ajustez les instructions de la tâche ou relancez la validation."
              technicalDetails={workflow.errorMessage}
              onRetry={onRunWorkflow}
            />
          )}

          {/* Real-time Agent Visualizer */}
          <AgentVisualizer
            currentPhase={workflow.currentPhase}
            activeAgent={workflow.activeAgent}
            isRunning={isRunning}
            steps={workflow.steps as AgentStep[]}
          />

          {/* Final Report Card when complete */}
          {workflow.finalReport && (
            <FinalReportCard
              report={workflow.finalReport}
              onViewFiles={() => setActiveSubTab('workspace')}
            />
          )}

          {/* Step-by-Step Reasoning Timeline */}
          <ExecutionTimeline steps={workflow.steps as AgentStep[]} isRunning={isRunning} />
        </div>
      )}

      {/* SUB-VIEW 2: WORKSPACE & CODE */}
      {activeSubTab === 'workspace' && (
        <WorkspaceExplorer
          files={files}
          onRefresh={onFetchWorkspace}
          onSaveFile={onSaveFile}
          onDeleteFile={onDeleteFile}
          onResetWorkspace={onResetWorkspace}
          gitStatus={gitStatus}
          gitDiff={gitDiff}
        />
      )}

      {/* SUB-VIEW 3: CI STATUS & GITHUB ACTIONS */}
      {activeSubTab === 'ci' && (
        <CIStatusDashboard
          delivery={delivery}
          configured={Boolean(delivery.trackedSha || delivery.commitSha)}
          onRefresh={onRefreshCi}
        />
      )}
    </div>
  );
};
