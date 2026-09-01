import React, { useState, useEffect } from 'react';
import { FolderTree, FileCode, Plus, RotateCcw, GitBranch, Terminal, Save, Check, Copy } from 'lucide-react';

interface WorkspaceExplorerProps {
  files: Record<string, string>;
  onRefresh: () => void;
  onSaveFile: (path: string, content: string) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  gitStatus?: string;
  gitDiff?: string;
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  files,
  onRefresh,
  onSaveFile,
  onResetWorkspace,
  gitStatus = '',
  gitDiff = '',
}) => {
  const fileKeys = Object.keys(files);
  const [selectedFile, setSelectedFile] = useState<string>(fileKeys[0] || 'src/math_utils.py');
  const [content, setContent] = useState<string>(files[selectedFile] || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'diff' | 'status'>('editor');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (files[selectedFile] !== undefined) {
      setContent(files[selectedFile]);
    } else if (fileKeys.length > 0) {
      setSelectedFile(fileKeys[0]);
      setContent(files[fileKeys[0]] || '');
    }
  }, [files, selectedFile]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveFile(selectedFile, content);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newFilePath.trim()) return;
    await onSaveFile(newFilePath.trim(), '# New file\n');
    setSelectedFile(newFilePath.trim());
    setNewFilePath('');
    setShowNewModal(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col h-[700px]">
      {/* Top Bar */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold text-slate-100">Virtual Sandbox Filesystem</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            ({fileKeys.length} files)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Subtabs */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubTab('editor')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 inline mr-1" />
              File Editor
            </button>
            <button
              onClick={() => setActiveSubTab('diff')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'diff' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 inline mr-1" />
              Git Diff
            </button>
            <button
              onClick={() => setActiveSubTab('status')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'status' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 inline mr-1" />
              Git Status
            </button>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New File
          </button>

          <button
            onClick={onResetWorkspace}
            title="Reset sandbox to initial defaults"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar: File Tree */}
        <div className="w-full md:w-64 bg-slate-950/60 border-r border-slate-800 p-3 overflow-y-auto space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 mb-1">
            Workspace Explorer
          </div>
          {fileKeys.map((path) => {
            const isSelected = selectedFile === path;
            const isTest = path.startsWith('tests/') || path.includes('test_');
            return (
              <button
                key={path}
                onClick={() => {
                  setSelectedFile(path);
                  setActiveSubTab('editor');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : isTest ? 'text-emerald-400' : 'text-blue-400'}`} />
                  <span className="truncate">{path}</span>
                </div>
                {isTest && !isSelected && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    QA
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Pane: Code Editor / Diff / Status */}
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
          {activeSubTab === 'editor' && (
            <>
              {/* File tab bar */}
              <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono text-slate-300">
                  <span className="text-slate-500">File:</span>
                  <span className="font-semibold text-blue-400">{selectedFile}</span>
                  <span className="text-[10px] text-slate-500">({content.split('\n').length} lines)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    {savedSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        {isSaving ? 'Saving...' : 'Save File'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Code TextArea */}
              <div className="flex-1 relative flex">
                {/* Line numbers gutter */}
                <div className="w-12 bg-slate-950/80 select-none py-4 text-right pr-3 font-mono text-xs text-slate-600 border-r border-slate-800/80 overflow-hidden">
                  {content.split('\n').map((_, i) => (
                    <div key={i} className="leading-6">
                      {i + 1}
                    </div>
                  ))}
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className="flex-1 bg-slate-900 text-slate-100 font-mono text-xs p-4 leading-6 resize-none focus:outline-none focus:ring-0 selection:bg-blue-600/40"
                />
              </div>
            </>
          )}

          {activeSubTab === 'diff' && (
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-slate-950">
              <div className="text-slate-400 font-semibold mb-2 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-purple-400" />
                Working Tree Git Diff:
              </div>
              {gitDiff ? (
                <pre className="text-slate-300 whitespace-pre-wrap bg-slate-900 p-4 rounded-xl border border-slate-800 leading-relaxed">
                  {gitDiff}
                </pre>
              ) : (
                <div className="text-slate-500 italic p-6 text-center">
                  No uncommitted diffs in the working tree.
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'status' && (
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-slate-950">
              <div className="text-slate-400 font-semibold mb-2 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                $ git status --short
              </div>
              <pre className="text-slate-300 whitespace-pre-wrap bg-slate-900 p-4 rounded-xl border border-slate-800">
                {gitStatus || 'nothing to commit, working tree clean'}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* New File Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 mb-2">Create New Virtual File</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter relative path (e.g., <code className="text-blue-400">src/service.py</code> or <code className="text-blue-400">tests/test_service.py</code>)
            </p>
            <input
              type="text"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              placeholder="src/my_module.py"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono mb-4 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
