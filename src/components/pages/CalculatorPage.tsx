import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator as CalculatorIcon,
  Delete,
  RotateCcw,
  History,
  Trash2,
  Copy,
  Check,
  Percent,
  Plus,
  Minus,
  X,
  Divide,
  Equal,
} from 'lucide-react';
import {
  CalculatorState,
  INITIAL_CALCULATOR_STATE,
  inputDigit,
  inputDecimal,
  toggleSign,
  applyPercentage,
  handleOperator,
  performEquals,
  backspace,
  clearAll,
  memoryClear,
  memoryRecall,
  memoryAdd,
  memorySubtract,
  clearHistory,
  CalculatorOperator,
} from '../../utils/calculatorLogic';

export const CalculatorPage: React.FC = () => {
  const [calcState, setCalcState] = useState<CalculatorState>(INITIAL_CALCULATOR_STATE);
  const [activeTab, setActiveTab] = useState<'keypad' | 'history'>('keypad');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Keypress event handler for full physical keyboard support
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Prevent triggering when user is typing in inputs elsewhere
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key;

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        setCalcState((prev) => inputDigit(prev, key));
      } else if (key === '.' || key === ',') {
        e.preventDefault();
        setCalcState((prev) => inputDecimal(prev));
      } else if (key === '+') {
        e.preventDefault();
        setCalcState((prev) => handleOperator(prev, '+'));
      } else if (key === '-') {
        e.preventDefault();
        setCalcState((prev) => handleOperator(prev, '-'));
      } else if (key === '*') {
        e.preventDefault();
        setCalcState((prev) => handleOperator(prev, '*'));
      } else if (key === '/') {
        e.preventDefault();
        setCalcState((prev) => handleOperator(prev, '/'));
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        setCalcState((prev) => performEquals(prev));
      } else if (key === 'Backspace') {
        e.preventDefault();
        setCalcState((prev) => backspace(prev));
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        e.preventDefault();
        setCalcState((prev) => clearAll(prev));
      } else if (key === '%') {
        e.preventDefault();
        setCalcState((prev) => applyPercentage(prev));
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const getOperatorSymbol = (op: CalculatorOperator): string => {
    switch (op) {
      case '+':
        return '+';
      case '-':
        return '−';
      case '*':
        return '×';
      case '/':
        return '÷';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <CalculatorIcon className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight">Calculatrice Web</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Calculatrice interactive avec mémoire, historique de calculs et support du clavier.
          </p>
        </div>

        {/* Tab switcher for Mobile / Compact views */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 sm:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('keypad')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'keypad'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Clavier
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historique ({calcState.history.length})</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Calculator Unit */}
        <div
          className={`lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 ${
            activeTab === 'history' ? 'hidden sm:block' : 'block'
          }`}
        >
          {/* Calculator Display Panel */}
          <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 sm:p-5 text-right space-y-1 shadow-inner relative overflow-hidden">
            {/* Top row: Memory indicator & expression */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono h-5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 opacity-90">
                {calcState.memory !== 0 ? `M (${calcState.memory})` : ''}
              </span>
              <span className="truncate max-w-[280px]">
                {calcState.previousValue !== null && (
                  <>
                    {calcState.previousValue} {getOperatorSymbol(calcState.operator)}
                  </>
                )}
              </span>
            </div>

            {/* Main result display */}
            <div
              className={`font-mono font-bold tracking-tight text-right transition-all overflow-x-auto whitespace-nowrap scrollbar-none ${
                calcState.hasError
                  ? 'text-rose-400 text-xl sm:text-2xl'
                  : calcState.displayValue.length > 12
                  ? 'text-xl sm:text-2xl text-slate-100'
                  : 'text-3xl sm:text-4xl text-slate-100'
              }`}
            >
              {calcState.displayValue}
            </div>

            {calcState.hasError && calcState.errorMessage && (
              <div className="text-[11px] text-rose-400 font-medium pt-1 text-right">
                {calcState.errorMessage}
              </div>
            )}
          </div>

          {/* Memory Row */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCalcState((prev) => memoryClear(prev))}
              className="py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              MC
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => memoryRecall(prev))}
              className="py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              MR
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => memoryAdd(prev))}
              className="py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              M+
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => memorySubtract(prev))}
              className="py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              M-
            </button>
          </div>

          {/* Button Keypad */}
          <div className="grid grid-cols-4 gap-2.5 pt-1">
            {/* Row 1 */}
            <button
              type="button"
              onClick={() => setCalcState((prev) => clearAll(prev))}
              className="py-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-sm transition cursor-pointer"
            >
              AC
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => backspace(prev))}
              className="py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition cursor-pointer flex items-center justify-center"
              aria-label="Effacer le dernier caractère"
            >
              <Delete className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => applyPercentage(prev))}
              className="py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition cursor-pointer flex items-center justify-center"
            >
              <Percent className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => handleOperator(prev, '/'))}
              className={`py-3.5 rounded-xl border text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                calcState.operator === '/'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
              }`}
            >
              <Divide className="w-4 h-4" />
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '7'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '8'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '9'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => handleOperator(prev, '*'))}
              className={`py-3.5 rounded-xl border text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                calcState.operator === '*'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Row 3 */}
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '4'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '5'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '6'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => handleOperator(prev, '-'))}
              className={`py-3.5 rounded-xl border text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                calcState.operator === '-'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Row 4 */}
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '1'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '2'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '3'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => handleOperator(prev, '+'))}
              className={`py-3.5 rounded-xl border text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                calcState.operator === '+'
                  ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Row 5 */}
            <button
              type="button"
              onClick={() => setCalcState((prev) => toggleSign(prev))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 font-semibold text-sm transition cursor-pointer"
            >
              ±
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDigit(prev, '0'))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => inputDecimal(prev))}
              className="py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-100 font-bold text-base transition cursor-pointer"
            >
              .
            </button>
            <button
              type="button"
              onClick={() => setCalcState((prev) => performEquals(prev))}
              className="py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base transition cursor-pointer shadow-lg shadow-blue-500/20 flex items-center justify-center"
            >
              <Equal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Calculation History Sidebar */}
        <div
          className={`lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 ${
            activeTab === 'keypad' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-slate-100">Historique</h3>
            </div>
            {calcState.history.length > 0 && (
              <button
                type="button"
                onClick={() => setCalcState((prev) => clearHistory(prev))}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Effacer</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[360px] space-y-2.5 pr-1 scrollbar-thin">
            {calcState.history.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs space-y-2">
                <CalculatorIcon className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                <p>Aucun calcul dans l'historique.</p>
                <p className="text-[11px] text-slate-600">Effectuez des opérations pour les retrouver ici.</p>
              </div>
            ) : (
              calcState.history.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 hover:border-slate-700 transition space-y-1 group"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>{item.expression} =</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(item.result, idx)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-200 transition cursor-pointer p-1"
                      title="Copier le résultat"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCalcState((prev) => ({
                        ...prev,
                        displayValue: item.result,
                        waitingForNewOperand: false,
                      }))
                    }
                    className="text-base font-bold text-emerald-400 font-mono hover:underline text-left block w-full truncate cursor-pointer"
                    title="Utiliser ce résultat"
                  >
                    {item.result}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 font-mono text-center">
            Raccourcis clavier : [0-9] [+] [-] [*] [/] [Enter] [Backspace] [Esc]
          </div>
        </div>
      </div>
    </div>
  );
};
