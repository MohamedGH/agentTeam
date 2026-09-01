import React from 'react';
import { Crown, Code2, FlaskConical, CheckCircle2, ArrowRight, ShieldAlert, Cpu } from 'lucide-react';
import { AgentRole, AgentStep } from '../types';

interface AgentVisualizerProps {
  currentPhase: number;
  activeAgent: AgentRole | null;
  isRunning: boolean;
  steps: AgentStep[];
}

interface AgentCardConfig {
  role: AgentRole;
  name: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  accentBg: string;
  borderColor: string;
  description: string;
  tools: string[];
}

const AGENTS: AgentCardConfig[] = [
  {
    role: 'manager',
    name: 'Manager',
    title: 'Autonomous Team Lead',
    icon: Crown,
    color: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: 'Orchestrates 7-phase workflow, decomposes requests, enforces safety limits & compiles final reports.',
    tools: ['delegate_developer', 'delegate_tester', 'delegate_reviewer'],
  },
  {
    role: 'developer',
    name: 'Developer',
    title: 'Senior Core Engineer',
    icon: Code2,
    color: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: 'Reads codebase, writes new files, patches existing logic, runs type checks, applies QA failure fixes.',
    tools: ['read_file', 'write_file', 'patch_file', 'run_command', 'git_status', 'git_diff'],
  },
  {
    role: 'tester',
    name: 'Tester',
    title: 'Senior QA Specialist',
    icon: FlaskConical,
    color: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    description: 'Executes test suites (pytest), asserts zero regressions, validates edge cases, yields PASS/FAIL verdicts.',
    tools: ['read_file', 'run_command', 'git_status', 'git_diff'],
  },
  {
    role: 'reviewer',
    name: 'Reviewer',
    title: 'Architect & Security Auditor',
    icon: CheckCircle2,
    color: 'text-purple-400',
    accentBg: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    description: 'Audits git diffs, verifies architecture, security, performance, maintainability, gives final APPROVED sign-off.',
    tools: ['read_file', 'run_command', 'git_diff'],
  },
];

const PHASES = [
  { num: 1, name: 'Analysis', agent: 'manager' },
  { num: 2, name: 'Implementation', agent: 'developer' },
  { num: 3, name: 'Testing & QA', agent: 'tester' },
  { num: 4, name: 'Correction (if Fail)', agent: 'developer' },
  { num: 5, name: 'Review', agent: 'reviewer' },
  { num: 6, name: 'Review Correction', agent: 'developer' },
  { num: 7, name: 'Final Delivery', agent: 'manager' },
];

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({
  currentPhase,
  activeAgent,
  isRunning,
  steps,
}) => {
  return (
    <div className="space-y-4">
      {/* Workflow Phase Ribbon */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-3 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              7-Phase Autonomous Workflow Loop
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {isRunning ? `Phase ${currentPhase || 1} in progress` : 'Ready to execute'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
          {PHASES.map((p) => {
            const isActive = isRunning && (currentPhase === p.num || (!currentPhase && p.num === 1));
            const isCompleted = steps.some((s) => s.phase === p.num);

            return (
              <div
                key={p.num}
                className={`flex flex-col p-2 rounded-lg text-center border transition-all ${
                  isActive
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/50 shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-900/80">
                    P{p.num}
                  </span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />}
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">{p.name}</span>
                <span className="text-[9px] text-slate-400 capitalize">{p.agent}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4 Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          const isActive = isRunning && activeAgent === agent.role;
          const agentSteps = steps.filter((s) => s.agent === agent.role);
          const lastStep = agentSteps[agentSteps.length - 1];

          return (
            <div
              key={agent.role}
              id={`agent-card-${agent.role}`}
              className={`rounded-xl border p-4 transition-all relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? `bg-slate-900 ${agent.borderColor} ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10`
                  : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
              }`}
            >
              {/* Active glow banner */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500 animate-pulse" />
              )}

              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg ${agent.accentBg} flex items-center justify-center ${agent.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{agent.name}</h3>
                      <p className="text-[11px] text-slate-400 leading-tight">{agent.title}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                        : agentSteps.length > 0
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}
                  >
                    {isActive ? 'Active' : agentSteps.length > 0 ? 'Participated' : 'Idle'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 mb-3 line-clamp-3 leading-relaxed">
                  {agent.description}
                </p>
              </div>

              {/* Tools & Latest Status */}
              <div>
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap gap-1 mb-2">
                    {agent.tools.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {lastStep && (
                    <div className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-2 rounded border border-slate-800/60 truncate">
                      <span className="text-slate-500">Status: </span>
                      <span className="font-semibold text-blue-400">{lastStep.status || 'Done'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
