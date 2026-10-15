import React, { useState } from 'react';
import {
  Calculator as CalcIcon,
  RotateCcw,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Equal,
  Delete,
} from 'lucide-react';
import {
  evaluateExpression,
  CalculationHistoryItem,
} from '../utils/calculator';

export const Calculator: React.FC = () => {
  const [expression, setExpression] = useState<string>('');
  const [displayResult, setDisplayResult] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);
  const [isScientific, setIsScientific] = useState<boolean>(true);
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [memory, setMemory] = useState<number>(0);

  const handleCalculate = () => {
    if (!expression.trim()) return;

    const result = evaluateExpression(expression);
    if (result.success && result.formattedResult !== undefined) {
      setDisplayResult(result.formattedResult);
      setError(null);

      // Add to history
      const newItem: CalculationHistoryItem = {
        id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        expression: expression.trim(),
        result: result.formattedResult,
        timestamp: Date.now(),
      };
      setHistory((prev) => [newItem, ...prev.slice(0, 49)]);
    } else {
      setError(result.error || 'Evaluation failed');
    }
  };

  const handleKeyPress = (val: string) => {
    setError(null);
    setExpression((prev) => prev + val);
  };

  const handleFunctionPress = (funcName: string) => {
    setError(null);
    setExpression((prev) => prev + `${funcName}(`);
  };

  const handleClear = () => {
    setExpression('');
    setDisplayResult('0');
    setError(null);
  };

  const handleBackspace = () => {
    setError(null);
    setExpression((prev) => prev.slice(0, -1));
  };

  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-') => {
    const currentVal = parseFloat(displayResult) || 0;
    switch (action) {
      case 'MC':
        setMemory(0);
        break;
      case 'MR':
        setExpression((prev) => prev + String(memory));
        break;
      case 'M+':
        setMemory((prev) => prev + currentVal);
        break;
      case 'M-':
        setMemory((prev) => prev - currentVal);
        break;
    }
  };

  const handleSelectHistoryItem = (item: CalculationHistoryItem) => {
    setExpression(item.expression);
    setDisplayResult(item.result);
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md max-w-lg w-full mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
            <CalcIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm tracking-wide flex items-center gap-2">
              Scientific Calculator
              <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                v1.0
              </span>
            </h3>
            <p className="text-xs text-slate-400">Standard & Scientific Expression Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsScientific((prev) => !prev)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors border ${
              isScientific
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:bg-slate-800'
            }`}
          >
            Scientific
          </button>
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors ${
              showHistory
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:bg-slate-800'
            }`}
            title="Calculation History"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen / Display */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between min-h-[100px] text-right font-mono relative overflow-hidden">
        {/* Active Expression */}
        <div className="text-xs text-slate-400 min-h-[1.25rem] overflow-x-auto whitespace-nowrap scrollbar-none">
          {expression || ' '}
        </div>

        {/* Display Result / Error */}
        {error ? (
          <div className="text-red-400 text-sm font-sans font-medium flex items-center justify-end gap-1.5 animate-fadeIn">
            <span>{error}</span>
          </div>
        ) : (
          <div className="text-2xl font-bold text-slate-100 tracking-tight overflow-x-auto whitespace-nowrap scrollbar-none">
            {displayResult}
          </div>
        )}

        {/* Memory Indicator */}
        {memory !== 0 && (
          <div className="absolute top-2 left-3 text-[10px] font-sans font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
            M ({memory})
          </div>
        )}
      </div>

      {/* Collapsible History Drawer */}
      {showHistory && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-blue-400" />
              Recent History
            </span>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 hover:underline"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No calculations in history yet.</div>
          ) : (
            <div className="space-y-1.5">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectHistoryItem(item)}
                  className="w-full text-left p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/60 flex items-center justify-between text-xs transition-colors group"
                >
                  <span className="font-mono text-slate-400 group-hover:text-slate-200 truncate max-w-[200px]">
                    {item.expression}
                  </span>
                  <span className="font-mono font-bold text-blue-400 group-hover:text-blue-300">
                    = {item.result}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memory Controls Bar */}
      <div className="grid grid-cols-4 gap-2">
        {(['MC', 'MR', 'M+', 'M-'] as const).map((memKey) => (
          <button
            key={memKey}
            onClick={() => handleMemory(memKey)}
            className="py-1.5 text-xs font-semibold rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            {memKey}
          </button>
        ))}
      </div>

      {/* Scientific Keys Grid */}
      {isScientific && (
        <div className="grid grid-cols-5 gap-2 border-t border-slate-800/80 pt-3">
          {[
            { label: 'sin', action: () => handleFunctionPress('sin') },
            { label: 'cos', action: () => handleFunctionPress('cos') },
            { label: 'tan', action: () => handleFunctionPress('tan') },
            { label: '√', action: () => handleFunctionPress('sqrt') },
            { label: '^', action: () => handleKeyPress('^') },
            { label: 'log', action: () => handleFunctionPress('log') },
            { label: 'ln', action: () => handleFunctionPress('ln') },
            { label: 'π', action: () => handleKeyPress('π') },
            { label: 'e', action: () => handleKeyPress('e') },
            { label: 'abs', action: () => handleFunctionPress('abs') },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              className="py-2 text-xs font-mono font-medium rounded-lg bg-slate-800/60 border border-slate-700/50 text-blue-300 hover:bg-blue-600/20 hover:border-blue-500/40 transition-colors"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Keypad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Row 1 */}
        <button
          onClick={handleClear}
          className="py-3 text-sm font-bold rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
        >
          AC
        </button>
        <button
          onClick={() => handleKeyPress('(')}
          className="py-3 text-sm font-semibold rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700 transition-colors"
        >
          (
        </button>
        <button
          onClick={() => handleKeyPress(')')}
          className="py-3 text-sm font-semibold rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700 transition-colors"
        >
          )
        </button>
        <button
          onClick={handleBackspace}
          className="py-3 text-sm font-semibold rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <Delete className="w-4 h-4" />
        </button>

        {/* Row 2 */}
        <button
          onClick={() => handleKeyPress('7')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          7
        </button>
        <button
          onClick={() => handleKeyPress('8')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          8
        </button>
        <button
          onClick={() => handleKeyPress('9')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          9
        </button>
        <button
          onClick={() => handleKeyPress('÷')}
          className="py-3 text-base font-bold rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
        >
          ÷
        </button>

        {/* Row 3 */}
        <button
          onClick={() => handleKeyPress('4')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          4
        </button>
        <button
          onClick={() => handleKeyPress('5')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          5
        </button>
        <button
          onClick={() => handleKeyPress('6')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          6
        </button>
        <button
          onClick={() => handleKeyPress('×')}
          className="py-3 text-base font-bold rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
        >
          ×
        </button>

        {/* Row 4 */}
        <button
          onClick={() => handleKeyPress('1')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          1
        </button>
        <button
          onClick={() => handleKeyPress('2')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          2
        </button>
        <button
          onClick={() => handleKeyPress('3')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          3
        </button>
        <button
          onClick={() => handleKeyPress('-')}
          className="py-3 text-base font-bold rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
        >
          -
        </button>

        {/* Row 5 */}
        <button
          onClick={() => handleKeyPress('0')}
          className="py-3 text-base font-semibold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          0
        </button>
        <button
          onClick={() => handleKeyPress('.')}
          className="py-3 text-base font-bold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          .
        </button>
        <button
          onClick={() => handleKeyPress('%')}
          className="py-3 text-base font-bold rounded-xl bg-slate-800/50 text-slate-100 border border-slate-700/40 hover:bg-slate-700/80 transition-colors"
        >
          %
        </button>
        <button
          onClick={() => handleKeyPress('+')}
          className="py-3 text-base font-bold rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
        >
          +
        </button>
      </div>

      {/* Calculate Button */}
      <button
        onClick={handleCalculate}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-[0.99]"
      >
        <Equal className="w-5 h-5" />
        Calculate (=)
      </button>
    </div>
  );
};
