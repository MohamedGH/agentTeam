import React from 'react';
import { FinalReport } from '../types';
import { Award, CheckCircle2, XCircle, FileCheck, Layers, Clock, Cpu, Sparkles, AlertCircle } from 'lucide-react';

interface FinalReportCardProps {
  report: FinalReport;
  onViewFiles?: () => void;
}

export const FinalReportCard: React.FC<FinalReportCardProps> = ({ report, onViewFiles }) => {
  const isAllGreen = report.implementation === 'PASS' && report.tests === 'PASS' && report.review === 'APPROVED';

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-2xl border border-blue-500/30 p-5 shadow-xl shadow-blue-500/5 relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Autonomous Team Delivery Report
              {isAllGreen ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All Gates Passed
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Attention Required
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">Verified by Manager, Developer, Tester & Reviewer agents</p>
          </div>
        </div>

        {/* Action button */}
        {onViewFiles && (
          <button
            onClick={onViewFiles}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all self-start sm:self-auto"
          >
            <FileCheck className="w-3.5 h-3.5" />
            Inspect Modified Files
          </button>
        )}
      </div>

      {/* 3 Core Quality Gates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Gate 1: Implementation */}
        <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              1. Developer
            </span>
            <span className="text-xs font-medium text-slate-200">Implementation</span>
          </div>
          <span
            className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
              report.implementation === 'PASS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            {report.implementation === 'PASS' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {report.implementation}
          </span>
        </div>

        {/* Gate 2: Tests */}
        <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              2. Tester (QA)
            </span>
            <span className="text-xs font-medium text-slate-200">Validation Suite</span>
          </div>
          <span
            className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
              report.tests === 'PASS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            {report.tests === 'PASS' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {report.tests}
          </span>
        </div>

        {/* Gate 3: Review */}
        <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              3. Reviewer
            </span>
            <span className="text-xs font-medium text-slate-200">Architecture Sign-Off</span>
          </div>
          <span
            className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
              report.review === 'APPROVED'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            {report.review === 'APPROVED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {report.review}
          </span>
        </div>
      </div>

      {/* Summaries & Diffs info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <h4 className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
            QA & Test Summary
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">{report.testSummary}</p>
        </div>

        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
          <h4 className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Reviewer Audit Summary
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">{report.reviewSummary}</p>
        </div>
      </div>

      {/* Files Changed */}
      {report.filesChanged && report.filesChanged.length > 0 && (
        <div className="mb-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            Artifacts Modified or Created ({report.filesChanged.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {report.filesChanged.map((f) => (
              <span
                key={f}
                className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 text-blue-300 border border-slate-800"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Execution Telemetry / Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Duration: <strong className="text-slate-200">{(report.metrics.durationMs / 1000).toFixed(2)}s</strong>
          </span>
          {report.metrics.providerUsed && (
            <span className="flex items-center gap-1.5 uppercase font-bold text-blue-400">
              Provider: <strong className="text-blue-300">{report.metrics.providerUsed}</strong>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            Model: <strong className="text-slate-200">{report.metrics.modelUsed}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
            Tokens: <strong className="text-slate-200">{report.metrics.totalTokens ?? report.metrics.estimatedTokens}</strong>
            {report.metrics.promptTokens !== undefined && (
              <span className="text-[10px] text-slate-500">
                ({report.metrics.promptTokens}p / {report.metrics.completionTokens}c)
              </span>
            )}
            {report.metrics.isRealTokenUsage && (
              <span className="text-[9px] text-emerald-400 font-semibold uppercase">Live</span>
            )}
          </span>
        </div>

        <div className="text-[11px] text-slate-500">
          Correction cycles: QA ({report.totalCycles.testerCorrections}) • Review ({report.totalCycles.reviewerCorrections})
        </div>
      </div>
    </div>
  );
};
