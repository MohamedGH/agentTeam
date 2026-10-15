import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator as CalcIcon,
  History,
  Trash2,
  Delete,
  Copy,
  Check,
  Sparkles,
  Binary,
} from 'lucide-react';
import {
  CalculatorMode,
  CalculatorHistoryItem,
  CalculatorState,
  INITIAL_CALCULATOR_STATE,
  evaluateExpression,
  calculateUnary,
  formatNumber,
} from '../utils/calculator';

interface CalculatorProps {
  className?: string;
}

export const Calculator: React.FC<CalculatorProps> = ({ className = '' }) => {
  const [state, setState] = useState<CalculatorState>(INITIAL_CALCULATOR_STATE);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const { display, expression, memory, history, mode, isNewInput, error } = state;

  // Clear error on user interaction
  const clearError = () => {
    if (error) {
      setState((prev) => ({ ...prev, error: null }));
    }
  };

  const handleDigit = useCallback((digit: string) => {
    setState((prev) => {
      clearError();
      if (prev.isNewInput || prev.display === '0') {
        return {
          ...prev,
          display: digit === '.' ? '0.' : digit,
          isNewInput: false,
          error: null,
        };
      }
      if (digit === '.' && prev.display.includes('.')) {
        return prev;
      }
      return {
        ...prev,
        display: prev.display + digit,
        error: null,
      };
    });
  }, []);

  const handleOperator = useCallback((op: string) => {
    setState((prev) => {
      const currentVal = prev.display;
      const newExpr = prev.expression
        ? `${prev.expression} ${currentVal} ${op}`
        : `${currentVal} ${op}`;

      return {
        ...prev,
        expression: newExpr,
        isNewInput: true,
        error: null,
      };
    });
  }, []);

  const handleEqual = useCallback(() => {
    setState((prev) => {
      if (!prev.expression && !prev.display) return prev;

      const fullExpr = prev.expression
        ? `${prev.expression} ${prev.display}`
        : prev.display;

      try {
        const { result, formatted } = evaluateExpression(fullExpr);
        const newItem: CalculatorHistoryItem = {
          id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          expression: fullExpr,
          result: formatted,
          timestamp: Date.now(),
        };

        return {
          ...prev,
          display: formatted,
          expression: '',
          isNewInput: true,
          history: [newItem, ...prev.history].slice(0, 30),
          error: null,
        };
      } catch (err: any) {
        return {
          ...prev,
          error: err.message || 'Calculation error',
          isNewInput: true,
        };
      }
    });
  }, []);

  const handleUnaryOp = useCallback(
    (op: 'sqrt' | 'square' | 'factorial' | 'negate' | 'reciprocal' | 'percent' | 'sin' | 'cos' | 'tan' | 'log' | 'ln') => {
      setState((prev) => {
        try {
          const num = parseFloat(prev.display);
          if (isNaN(num)) throw new Error('Invalid input');
          const res = calculateUnary(num, op);
          const formatted = formatNumber(res);

          return {
            ...prev,
            display: formatted,
            isNewInput: true,
            error: null,
          };
        } catch (err: any) {
          return {
            ...prev,
            error: err.message || 'Error',
            isNewInput: true,
          };
        }
      });
    },
    []
  );

  const handleClear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      display: '0',
      expression: '',
      isNewInput: true,
      error: null,
    }));
  }, []);

  const handleBackspace = useCallback(() => {
    setState((prev) => {
      if (prev.isNewInput || prev.display.length <= 1) {
        return { ...prev, display: '0', isNewInput: true };
      }
      return {
        ...prev,
        display: prev.display.slice(0, -1),
      };
    });
  }, []);

  // Memory functions
  const handleMemory = useCallback((action: 'MC' | 'MR' | 'M+' | 'M-') => {
    setState((prev) => {
      const val = parseFloat(prev.display) || 0;
      switch (action) {
        case 'MC':
          return { ...prev, memory: 0 };
        case 'MR':
          return { ...prev, display: formatNumber(prev.memory), isNewInput: true };
        case 'M+':
          return { ...prev, memory: prev.memory + val, isNewInput: true };
        case 'M-':
          return { ...prev, memory: prev.memory - val, isNewInput: true };
        default:
          return prev;
      }
    });
  }, []);

  const handleParenthesis = useCallback((paren: '(' | ')') => {
    setState((prev) => {
      if (paren === '(') {
        const newExpr = prev.expression ? `${prev.expression} (` : '(';
        return { ...prev, expression: newExpr, isNewInput: true };
      } else {
        const newExpr = `${prev.expression} ${prev.display} )`;
        return { ...prev, expression: newExpr, isNewInput: true };
      }
    });
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.') {
        handleDigit('.');
      } else if (e.key === '+') {
        handleOperator('+');
      } else if (e.key === '-') {
        handleOperator('-');
      } else if (e.key === '*') {
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEqual();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === '(' || e.key === ')') {
        handleParenthesis(e.key as '(' | ')');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleOperator, handleEqual, handleBackspace, handleClear, handleParenthesis]);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl max-w-lg w-full mx-auto font-sans transition-all ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <CalcIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <span>Calculatrice</span>
              {memory !== 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-mono font-bold">
                  M = {formatNumber(memory)}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">Standard & Scientific Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setState((p) => ({ ...p, mode: 'standard' }))}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                mode === 'standard'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setState((p) => ({ ...p, mode: 'scientific' }))}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                mode === 'scientific'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scientifique
            </button>
          </div>

          {/* History Toggle Button */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg border transition cursor-pointer ${
              showHistory
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Historique des calculs"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Display */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 mb-4 text-right shadow-inner relative group">
        <div className="text-xs font-mono text-slate-400 min-h-[1.25rem] truncate">
          {expression || '\u00A0'}
        </div>
        <div className="flex items-baseline justify-between mt-1 gap-2">
          <button
            type="button"
            onClick={copyToClipboard}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer shrink-0"
            title="Copier le résultat"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-100 tracking-tight truncate">
            {error ? <span className="text-rose-400 text-xl font-normal">{error}</span> : display}
          </div>
        </div>
      </div>

      {/* History Side Panel overlay */}
      {showHistory ? (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4 max-h-64 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
            <span>Historique ({history.length})</span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, history: [] }))}
                className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition text-[11px] cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Effacer</span>
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Aucun calcul récent</p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                onClick={() =>
                  setState((p) => ({
                    ...p,
                    display: item.result,
                    isNewInput: true,
                  }))
                }
                className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/50 text-right cursor-pointer transition group"
              >
                <div className="text-[11px] font-mono text-slate-400 group-hover:text-blue-300">
                  {item.expression} =
                </div>
                <div className="text-sm font-mono font-bold text-slate-200">{item.result}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Memory Controls Bar */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {(['MC', 'MR', 'M+', 'M-'] as const).map((memKey) => (
          <button
            key={memKey}
            type="button"
            onClick={() => handleMemory(memKey)}
            className="py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-bold text-slate-400 hover:text-blue-400 transition cursor-pointer"
          >
            {memKey}
          </button>
        ))}
      </div>

      {/* Scientific Keys Grid (Only if Scientific Mode) */}
      {mode === 'scientific' && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          <button
            type="button"
            onClick={() => handleParenthesis('(')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            (
          </button>
          <button
            type="button"
            onClick={() => handleParenthesis(')')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            )
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('sin')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            sin
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('cos')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            cos
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('tan')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            tan
          </button>

          <button
            type="button"
            onClick={() => handleUnaryOp('sqrt')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            √x
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('square')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            x²
          </button>
          <button
            type="button"
            onClick={() => handleOperator('^')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            x^y
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('log')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            log
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('ln')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            ln
          </button>

          <button
            type="button"
            onClick={() => handleUnaryOp('factorial')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            n!
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('reciprocal')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            1/x
          </button>
          <button
            type="button"
            onClick={() => handleUnaryOp('percent')}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            %
          </button>
          <button
            type="button"
            onClick={() => handleDigit(Math.PI.toString())}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            π
          </button>
          <button
            type="button"
            onClick={() => handleDigit(Math.E.toString())}
            className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-xs font-mono font-medium text-slate-300 transition cursor-pointer"
          >
            e
          </button>
        </div>
      )}

      {/* Primary Keypad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Row 1: C, Backspace, ±, ÷ */}
        <button
          type="button"
          onClick={handleClear}
          className="py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30 transition cursor-pointer text-sm"
        >
          C
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition cursor-pointer"
        >
          <Delete className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleUnaryOp('negate')}
          className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition cursor-pointer text-sm font-mono"
        >
          ±
        </button>
        <button
          type="button"
          onClick={() => handleOperator('÷')}
          className="py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold border border-blue-500/30 transition cursor-pointer text-lg font-mono"
        >
          ÷
        </button>

        {/* Row 2: 7, 8, 9, × */}
        {['7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-100 font-bold border border-slate-800/80 transition cursor-pointer text-lg font-mono shadow-xs"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('×')}
          className="py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold border border-blue-500/30 transition cursor-pointer text-lg font-mono"
        >
          ×
        </button>

        {/* Row 3: 4, 5, 6, - */}
        {['4', '5', '6'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-100 font-bold border border-slate-800/80 transition cursor-pointer text-lg font-mono shadow-xs"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('-')}
          className="py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold border border-blue-500/30 transition cursor-pointer text-lg font-mono"
        >
          −
        </button>

        {/* Row 4: 1, 2, 3, + */}
        {['1', '2', '3'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-100 font-bold border border-slate-800/80 transition cursor-pointer text-lg font-mono shadow-xs"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('+')}
          className="py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold border border-blue-500/30 transition cursor-pointer text-lg font-mono"
        >
          +
        </button>

        {/* Row 5: 0, ., = */}
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="col-span-2 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-100 font-bold border border-slate-800/80 transition cursor-pointer text-lg font-mono shadow-xs"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => handleDigit('.')}
          className="py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-100 font-bold border border-slate-800/80 transition cursor-pointer text-lg font-mono"
        >
          .
        </button>
        <button
          type="button"
          onClick={handleEqual}
          className="py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-blue-500/20 transition cursor-pointer text-xl font-mono"
        >
          =
        </button>
      </div>
    </div>
  );
};
