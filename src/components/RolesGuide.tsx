import React from 'react';
import { Crown, Code2, FlaskConical, CheckCircle2, ShieldAlert, Cpu, Layers, GitBranch, Terminal } from 'lucide-react';

export const RolesGuide: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl">
        <h2 className="text-base font-bold text-slate-100 mb-1 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-400" />
          Autonomous Team Architecture & Safety Contract
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Standard Operating Procedures, role boundaries, verification gates, and safety constraints governing the <code className="text-blue-400 font-mono">agentTeam</code> ecosystem.
        </p>
      </div>

      {/* 4 Agent Specifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Manager */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">1. Manager Agent (Root)</h3>
              <p className="text-[11px] text-slate-400">Autonomous Software Development Team Manager</p>
            </div>
          </div>
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p><strong>Responsibilities:</strong> High-level problem decomposition, delegating to Developer, routing QA feedback, submitting for Reviewer approval, compiling the final structured delivery report.</p>
            <p><strong>Workflow Governance:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
              <li>Phase 1: Task analysis & architecture breakdown</li>
              <li>Phase 2: Delegate implementation to Developer</li>
              <li>Phase 3: Delegate QA validation to Tester</li>
              <li>Phase 4: Max 3 correction cycles on test failure</li>
              <li>Phase 5: Delegate to Reviewer after tests pass</li>
              <li>Phase 6: Max 2 review correction cycles</li>
              <li>Phase 7: Compile structured final delivery report</li>
            </ul>
          </div>
        </div>

        {/* Developer */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">2. Developer Agent</h3>
              <p className="text-[11px] text-slate-400">Senior Autonomous Software Developer</p>
            </div>
          </div>
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p><strong>Responsibilities:</strong> Inspects repository, reads existing code, implements targeted minimal patches, writes new files, debugs failures.</p>
            <p><strong>Strict Rules:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
              <li>Use <code className="text-blue-400">write_file</code> ONLY for new files</li>
              <li>Use <code className="text-blue-400">patch_file</code> for existing files (exact single match)</li>
              <li>Make minimal targeted changes; preserve existing functionality</li>
              <li>Never touch protected directories or expose secrets</li>
            </ul>
          </div>
        </div>

        {/* Tester */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">3. Tester Agent (QA)</h3>
              <p className="text-[11px] text-slate-400">Senior QA Specialist & Test Engineer</p>
            </div>
          </div>
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p><strong>Responsibilities:</strong> Independent validation, regression detection, edge-case probing, lint & type verification, test assertions.</p>
            <p><strong>Strict Rules:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
              <li>DO NOT modify production code</li>
              <li>Never report PASS without executing real validation</li>
              <li>On FAIL: provide failing test, error, affected file, probable cause</li>
            </ul>
          </div>
        </div>

        {/* Reviewer */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">4. Reviewer Agent</h3>
              <p className="text-[11px] text-slate-400">Senior Architect & Security Auditor</p>
            </div>
          </div>
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p><strong>Responsibilities:</strong> Audits git diffs, verifies architecture, security, performance, maintainability, error handling, gives final sign-off.</p>
            <p><strong>Strict Rules:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
              <li>Inspects full git diff and changed files</li>
              <li>Returns either <code className="text-emerald-400">STATUS: APPROVED</code> or <code className="text-amber-400">STATUS: CHANGES_REQUIRED</code></li>
              <li>Details strengths, security concerns, and architectural notes</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Safety Mandates */}
      <div className="bg-slate-900 rounded-2xl border border-amber-500/30 p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">Safety & Sandboxing Enforcements</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300">
            <strong className="text-amber-400 block mb-1">Protected Dirs & Files</strong>
            Strictly forbids reading or modifying <code className="text-blue-400">.env</code>, <code className="text-blue-400">.venv</code>, <code className="text-blue-400">.git</code>, or <code className="text-blue-400">node_modules</code>.
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300">
            <strong className="text-blue-400 block mb-1">Allowed Commands</strong>
            Command whitelist limited to <code className="text-blue-400">python, pytest, git, npm, ruff, mypy</code>.
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300">
            <strong className="text-purple-400 block mb-1">Iteration Caps</strong>
            Max 3 QA correction loops and max 2 Reviewer correction loops to prevent infinite spending.
          </div>
        </div>
      </div>
    </div>
  );
};
