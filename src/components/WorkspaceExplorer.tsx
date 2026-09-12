import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  FileCode,
  Plus,
  RotateCcw,
  GitBranch,
  Terminal,
  Save,
  Check,
  Copy,
  Trash2,
  Play,
  Search,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react';

interface WorkspaceExplorerProps {
  files: Record<string, string>;
  onRefresh: () => void;
  onSaveFile: (path: string, content: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  gitStatus?: string;
  gitDiff?: string;
}

interface CommandHistoryItem {
  command: string;
  output: string;
  timestamp: string;
  isSuccess: boolean;
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  files,
  onRefresh,
  onSaveFile,
  onDeleteFile,
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
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'diff' | 'status' | 'terminal'>('editor');
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Terminal & Command Runner State
  const [commandInput, setCommandInput] = useState('pytest');
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([
    {
      command: 'pytest',
      output: `============================= test session starts ==============================\nplatform linux -- Python 3.11.8, pytest-8.1.1\nrootdir: /workspace\ncollected 4 items\n\ntests/test_math_utils.py .. [ 50%]\ntests/test_user_service.py .. [100%]\n\n============================== 4 passed in 0.12s ==============================`,
      timestamp: new Date().toLocaleTimeString(),
      isSuccess: true,
    },
  ]);

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

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    if (onDeleteFile) {
      await onDeleteFile(fileToDelete);
    } else {
      await fetch('/api/workspace/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fileToDelete }),
      });
      onRefresh();
    }
    setFileToDelete(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.split('/').pop() || 'file.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    const dataStr = JSON.stringify(files, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workspace-snapshot.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const executeCommand = async (cmdToRun: string) => {
    if (!cmdToRun.trim() || isRunningCommand) return;
    setIsRunningCommand(true);

    try {
      const res = await fetch('/api/workspace/run-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdToRun }),
      });

      if (res.ok) {
        const data = await res.json();
        const isSuccess = !data.output.includes('FAILED') && !data.output.includes('ERROR:');
        setCommandHistory((prev) => [
          {
            command: cmdToRun,
            output: data.output || 'Command executed successfully with zero errors.',
            timestamp: new Date().toLocaleTimeString(),
            isSuccess,
          },
          ...prev,
        ]);
      } else {
        setCommandHistory((prev) => [
          {
            command: cmdToRun,
            output: `ERROR: Execution failed with status ${res.status}`,
            timestamp: new Date().toLocaleTimeString(),
            isSuccess: false,
          },
          ...prev,
        ]);
      }
    } catch (err: any) {
      setCommandHistory((prev) => [
        {
          command: cmdToRun,
          output: `ERROR: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
          isSuccess: false,
        },
        ...prev,
      ]);
    } finally {
      setIsRunningCommand(false);
    }
  };

  const filteredFileKeys = fileKeys.filter((path) =>
    path.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col h-[750px]">
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Subtabs */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              id="tab-file-editor"
              onClick={() => setActiveSubTab('editor')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 inline mr-1" />
              File Editor
            </button>
            <button
              id="tab-terminal"
              onClick={() => setActiveSubTab('terminal')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'terminal' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 inline mr-1" />
              Test & Terminal
            </button>
            <button
              id="tab-git-diff"
              onClick={() => setActiveSubTab('diff')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'diff' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 inline mr-1" />
              Git Diff
            </button>
            <button
              id="tab-git-status"
              onClick={() => setActiveSubTab('status')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeSubTab === 'status' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Git Status
            </button>
          </div>

          <button
            id="btn-new-file"
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New File
          </button>

          <button
            id="btn-download-workspace"
            onClick={handleDownloadAll}
            title="Export all workspace files as JSON"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            id="btn-reset-workspace"
            onClick={onResetWorkspace}
            title="Reset sandbox to initial defaults"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar: File Tree */}
        <div className="w-full md:w-64 bg-slate-950/70 border-r border-slate-800 p-3 flex flex-col overflow-hidden">
          {/* File search filter */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter files..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 mb-1">
            Workspace Files
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {filteredFileKeys.map((path) => {
              const isSelected = selectedFile === path;
              const isTest = path.startsWith('tests/') || path.includes('test_');
              return (
                <div
                  key={path}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedFile(path);
                      if (activeSubTab !== 'editor') setActiveSubTab('editor');
                    }}
                    className="flex items-center gap-2 truncate flex-1 text-left cursor-pointer"
                  >
                    <FileCode
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? 'text-white' : isTest ? 'text-emerald-400' : 'text-blue-400'
                      }`}
                    />
                    <span className="truncate">{path}</span>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isTest && !isSelected && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        QA
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFileToDelete(path);
                      }}
                      title={`Delete ${path}`}
                      className={`p-1 rounded transition-opacity cursor-pointer ${
                        isSelected
                          ? 'hover:bg-blue-700 text-blue-200 opacity-80 hover:opacity-100'
                          : 'opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Code Editor / Diff / Status / Terminal */}
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
          {activeSubTab === 'editor' && (
            <>
              {/* File tab bar */}
              <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-mono text-slate-300">
                  <span className="text-slate-500">File:</span>
                  <span className="font-semibold text-blue-400">{selectedFile}</span>
                  <span className="text-[10px] text-slate-500">({content.split('\n').length} lines)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    onClick={handleDownloadFile}
                    title="Download this file"
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save Local
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
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
              <div className="flex-1 relative flex overflow-hidden">
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

          {/* Dedicated Terminal & Pytest Runner */}
          {activeSubTab === 'terminal' && (
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
              {/* Terminal Quick Actions Header */}
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-slate-200">Sandbox Test Runner & CLI</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    id="btn-run-pytest"
                    onClick={() => {
                      setCommandInput('pytest');
                      executeCommand('pytest');
                    }}
                    disabled={isRunningCommand}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-mono text-xs cursor-pointer transition-all"
                  >
                    <Play className="w-3 h-3 fill-emerald-400" />
                    pytest
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('ruff check');
                      executeCommand('ruff check');
                    }}
                    disabled={isRunningCommand}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer transition-all"
                  >
                    ruff check
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('mypy');
                      executeCommand('mypy');
                    }}
                    disabled={isRunningCommand}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer transition-all"
                  >
                    mypy
                  </button>
                  <button
                    onClick={() => {
                      setCommandInput('git status');
                      executeCommand('git status');
                    }}
                    disabled={isRunningCommand}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer transition-all"
                  >
                    git status
                  </button>
                  <button
                    onClick={() => setCommandHistory([])}
                    className="px-2 py-1 rounded text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                  >
                    Clear Output
                  </button>
                </div>
              </div>

              {/* Command Prompt Input */}
              <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center gap-2">
                <span className="text-emerald-400 font-mono text-xs font-bold">$</span>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      executeCommand(commandInput);
                    }
                  }}
                  placeholder="Type command (e.g. pytest, ruff, mypy, git status)..."
                  className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none placeholder-slate-600"
                />
                <button
                  onClick={() => executeCommand(commandInput)}
                  disabled={isRunningCommand || !commandInput.trim()}
                  className="flex items-center gap-1 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-white" />
                  {isRunningCommand ? 'Running...' : 'Run'}
                </button>
              </div>

              {/* Command Output Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 font-mono text-xs">
                {commandHistory.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <div className="flex items-center gap-2">
                        {item.isSuccess ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span className="text-emerald-300 font-bold">$ {item.command}</span>
                      </div>
                      <span>{item.timestamp}</span>
                    </div>
                    <pre
                      className={`p-3 rounded-lg border whitespace-pre-wrap leading-relaxed ${
                        item.isSuccess
                          ? 'bg-slate-900 border-slate-800 text-slate-200'
                          : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {item.output}
                    </pre>
                  </div>
                ))}

                {commandHistory.length === 0 && (
                  <div className="text-slate-600 italic text-center py-12">
                    Terminal is clear. Execute a command above to view output.
                  </div>
                )}
              </div>
            </div>
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
                <FileText className="w-4 h-4 text-emerald-400" />
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-100">Delete File?</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Are you sure you want to delete <code className="text-rose-400 font-mono">{fileToDelete}</code> from the sandbox workspace? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setFileToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
