import React, { useState } from 'react';
import { AgentStep, AgentRole } from '../types';
import {
  Crown,
  Code2,
  FlaskConical,
  CheckCircle2,
  Terminal,
  FileCode,
  Zap,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  Cpu,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import Markdown from 'react-markdown';

interface ExecutionTimelineProps {
  steps: AgentStep[];
  isRunning: boolean;
}

const AGENT_META: Record<
  AgentRole,
  { name: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  manager: { name: 'Manager', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Crown },
  developer: { name: 'Developer', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Code2 },
  tester: { name: 'Tester', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: FlaskConical },
  reviewer: { name: 'Reviewer', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: CheckCircle2 },
};

/**
 * Calculates prompt and completion tokens for a step with fallback heuristics
 */
function getStepTokens(step: AgentStep): { prompt: number; completion: number; total: number; isFallback: boolean } {
  if (step.tokenAccountingType === 'fallback_unknown' || (!step.isRealTokenUsage && step.totalTokens === 0 && (step.promptTokens === 0 || step.promptTokens === undefined))) {
    return { prompt: 0, completion: 0, total: 0, isFallback: true };
  }

  if (step.promptTokens !== undefined && step.completionTokens !== undefined) {
    const total = step.totalTokens ?? step.promptTokens + step.completionTokens;
    return { prompt: step.promptTokens, completion: step.completionTokens, total, isFallback: false };
  }

  return { prompt: 0, completion: 0, total: 0, isFallback: true };
}

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({ steps, isRunning }) => {
  const [showAgentBreakdown, setShowAgentBreakdown] = useState(false);

  if (steps.length === 0 && !isRunning) {
    return (
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
          <Terminal className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Execution Stream Idle</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Submit a software requirement above or select a preset task to watch the Manager, Developer, Tester, and Reviewer agents collaborate in real time.
        </p>
      </div>
    );
  }

  // Calculate aggregated metrics for the mini-dashboard
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;

  const agentTokenStats: Record<AgentRole, { prompt: number; completion: number; total: number; stepCount: number }> = {
    manager: { prompt: 0, completion: 0, total: 0, stepCount: 0 },
    developer: { prompt: 0, completion: 0, total: 0, stepCount: 0 },
    tester: { prompt: 0, completion: 0, total: 0, stepCount: 0 },
    reviewer: { prompt: 0, completion: 0, total: 0, stepCount: 0 },
  };

  steps.forEach((step) => {
    const { prompt, completion, total } = getStepTokens(step);
    totalPromptTokens += prompt;
    totalCompletionTokens += completion;
    totalTokens += total;

    if (agentTokenStats[step.agent]) {
      agentTokenStats[step.agent].prompt += prompt;
      agentTokenStats[step.agent].completion += completion;
      agentTokenStats[step.agent].total += total;
      agentTokenStats[step.agent].stepCount += 1;
    }
  });

  const promptPct = totalTokens > 0 ? Math.round((totalPromptTokens / totalTokens) * 100) : 60;
  const compPct = totalTokens > 0 ? Math.round((totalCompletionTokens / totalTokens) * 100) : 40;
  const avgTokensPerStep = steps.length > 0 ? Math.round(totalTokens / steps.length) : 0;

  return (
    <div className="space-y-4">
      {/* Mini-Dashboard: Workflow Token Telemetry & Token Counts */}
      {steps.length > 0 && (
        <div
          id="execution-token-dashboard"
          className="bg-slate-900/95 rounded-2xl border border-slate-800 p-4 shadow-lg transition-all"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  Workflow Token Consumption
                  <span className="text-[10px] font-normal text-slate-400 font-mono">
                    ({steps.length} {steps.length === 1 ? 'step' : 'steps'} completed)
                  </span>
                  {steps.some((s) => s.isRealTokenUsage) ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                      <Sparkles className="w-2.5 h-2.5" />
                      Live AI API Telemetry
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                      Token Telemetry
                    </span>
                  )}
                </h4>
              </div>
            </div>

            <button
              onClick={() => setShowAgentBreakdown(!showAgentBreakdown)}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer"
            >
              <span>{showAgentBreakdown ? 'Hide Breakdown' : 'Agent Breakdown'}</span>
              {showAgentBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            {/* Total Tokens */}
            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Total Tokens</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-base font-bold text-slate-100 font-mono">
                {totalTokens.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Estimated aggregate</div>
            </div>

            {/* Prompt Tokens */}
            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80">
              <div className="flex items-center justify-between text-blue-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prompt Tokens</span>
                <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-base font-bold text-blue-300 font-mono">
                {totalPromptTokens.toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-400/80 font-mono mt-0.5">{promptPct}% of total input</div>
            </div>

            {/* Completion Tokens */}
            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80">
              <div className="flex items-center justify-between text-indigo-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Completion Tokens</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-base font-bold text-indigo-300 font-mono">
                {totalCompletionTokens.toLocaleString()}
              </div>
              <div className="text-[10px] text-indigo-400/80 font-mono mt-0.5">{compPct}% generated output</div>
            </div>

            {/* Average Per Step */}
            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Avg / Step</span>
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-base font-bold text-slate-200 font-mono">
                ~{avgTokensPerStep.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Tokens per cycle</div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Prompt (Input): <strong className="text-blue-300">{totalPromptTokens.toLocaleString()}</strong> ({promptPct}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Completion (Output): <strong className="text-indigo-300">{totalCompletionTokens.toLocaleString()}</strong> ({compPct}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${promptPct}%` }}
                title={`Prompt Tokens: ${totalPromptTokens} (${promptPct}%)`}
              />
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${compPct}%` }}
                title={`Completion Tokens: ${totalCompletionTokens} (${compPct}%)`}
              />
            </div>
          </div>

          {/* Detailed Agent Breakdown Drawer */}
          {showAgentBreakdown && (
            <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['manager', 'developer', 'tester', 'reviewer'] as AgentRole[]).map((role) => {
                const meta = AGENT_META[role];
                const stats = agentTokenStats[role];
                const Icon = meta.icon;

                return (
                  <div
                    key={role}
                    className="bg-slate-950 p-2 rounded-xl border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className={`w-4 h-4 rounded ${meta.bg} flex items-center justify-center ${meta.color}`}>
                        <Icon className="w-2.5 h-2.5" />
                      </div>
                      <span className={`text-[11px] font-bold ${meta.color}`}>{meta.name}</span>
                      <span className="text-[9px] text-slate-500 font-mono ml-auto">
                        {stats.stepCount} {stats.stepCount === 1 ? 'step' : 'steps'}
                      </span>
                    </div>

                    <div className="font-mono text-slate-200 font-semibold text-xs mb-0.5">
                      {stats.total.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">tokens</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>In: {stats.prompt}</span>
                      <span>Out: {stats.completion}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Log Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          Autonomous Multi-Agent Activity Log ({steps.length} steps)
        </h3>
        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-blue-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            Active deliberation...
          </div>
        )}
      </div>

      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const meta = AGENT_META[step.agent] || AGENT_META.developer;
          const Icon = meta.icon;
          const { prompt: stepPrompt, completion: stepComp, total: stepTotal } = getStepTokens(step);

          return (
            <div
              key={step.id || idx}
              id={`step-${step.id || idx}`}
              className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 transition-all shadow-sm"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center ${meta.color} border ${meta.border}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${meta.color}`}>{meta.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                        Phase {step.phase}: {step.phaseName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Step Provider & Token Chip */}
                  {step.provider && (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-blue-300 border border-slate-700 font-semibold uppercase tracking-wider">
                      {step.provider}
                    </span>
                  )}
                  {getStepTokens(step).isFallback ? (
                    <span
                      title="Graceful fallback execution - unmetered"
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-slate-400 border border-slate-800 flex items-center gap-1 font-medium"
                    >
                      <Zap className="w-2.5 h-2.5 text-slate-500" />
                      <span>Fallback (Unmetered)</span>
                    </span>
                  ) : (
                    <span
                      title={
                        step.tokenAccountingType === 'real_provider'
                          ? `Live from ${step.provider || 'AI'} API: ${stepPrompt} prompt tokens, ${stepComp} completion tokens`
                          : step.tokenAccountingType === 'mock'
                          ? `Mock execution tokens: ${stepPrompt} prompt, ${stepComp} completion`
                          : `Tokens: ${stepPrompt} prompt, ${stepComp} completion`
                      }
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800 flex items-center gap-1 font-medium"
                    >
                      <Zap className={`w-2.5 h-2.5 ${step.tokenAccountingType === 'real_provider' ? 'text-emerald-400' : 'text-blue-400'}`} />
                      <span>{stepTotal} tok</span>
                      <span className="text-slate-500">({stepPrompt}p / {stepComp}c)</span>
                      {step.tokenAccountingType === 'real_provider' && (
                        <span className="text-[9px] text-emerald-400 font-semibold uppercase">Live</span>
                      )}
                      {step.tokenAccountingType === 'mock' && (
                        <span className="text-[9px] text-blue-400 font-semibold uppercase">Mock</span>
                      )}
                    </span>
                  )}

                  {step.status && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                        step.status.includes('PASS') || step.status.includes('APPROVED')
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : step.status.includes('FAIL') || step.status.includes('CHANGES_REQUIRED')
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {step.status}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Automatic Failover Telemetry */}
              {step.failoverHistory && step.failoverHistory.length > 0 && (
                <div className="mb-3 bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Automatic Model Failover Succeeded</span>
                    <span className="text-[10px] font-mono text-amber-400/80">({step.failoverHistory.length} fallback{step.failoverHistory.length > 1 ? 's' : ''})</span>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    {step.failoverHistory.map((rec, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-1 text-slate-400">
                        <span className="text-amber-300 font-semibold">{rec.provider}/{rec.model}</span>
                        <span className="text-rose-400 font-medium">failed ({rec.reason})</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-slate-300 truncate max-w-sm">{rec.error}</span>
                      </div>
                    ))}
                    <div className="text-emerald-400 font-medium pt-0.5 flex items-center gap-1">
                      <span>✓</span>
                      <span>Primary model failed → fallback model succeeded ({step.provider || 'fallback'}{step.model ? `/${step.model}` : ''})</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Agent Thought / Reasoning */}
              {step.thought && (
                <div className="mb-3 text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 font-sans">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    Agent Deliberation & Strategy:
                  </div>
                  <div className="markdown-body whitespace-pre-line text-slate-200">
                    {step.thought}
                  </div>
                </div>
              )}

              {/* Tool Calls */}
              {step.toolCalls && step.toolCalls.length > 0 && (
                <div className="space-y-2 mb-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <FileCode className="w-3 h-3 text-blue-400" />
                    Tool Executions ({step.toolCalls.length}):
                  </div>
                  {step.toolCalls.map((tc, tcIdx) => (
                    <div
                      key={tc.id || tcIdx}
                      className="bg-slate-950 rounded-lg border border-slate-800 p-2.5 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between text-blue-400 font-semibold mb-1">
                        <span>$ {tc.name}({JSON.stringify(tc.args)})</span>
                        <span className="text-[10px] text-slate-500">{new Date(tc.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-slate-300 text-[11px] whitespace-pre-wrap bg-slate-900/60 p-2 rounded border border-slate-800/40 max-h-48 overflow-y-auto">
                        {tc.result}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Output / Verdict */}
              {step.output && (
                <div className="text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800/70 text-slate-300 font-mono">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-0.5">Summary / Verdict:</span>
                  <div className="whitespace-pre-line">{step.output}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
