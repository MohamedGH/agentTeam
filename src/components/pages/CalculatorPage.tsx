import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator as CalculatorIcon,
  Delete,
  RotateCcw,
  History,
  Copy,
  Check,
  Trash2,
  HelpCircle,
  Hash,
} from 'lucide-react';
import {
  CalculatorState,
  INITIAL_CALCULATOR_STATE,
  inputDigit,
  inputDecimal,
  clearAll,
  clearEntry,
  backspace,
  toggleSign,
  inputPercent,
  performOperation,
  calculateEquals,
  memoryClear,
  memoryRecall,
  memoryAdd,
  memorySubtract,
  clearHistory,
  CalculatorOperator,
  formatOperatorSymbol,
} from '../../utils/calculator';

export const CalculatorPage: React.FC = () => {
  const [calcState, setCalcState] = useState<CalculatorState>(INITIAL_CALCULATOR_STATE);
  const [showHistory, setShowHistory] = useState<boolean>(true);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  // Keyboard Event Handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      const key = e.key;

      if (key >= '0' && key <= '9') {
        e.preventDefault();
        setCalcState((prev) => inputDigit(prev, key));
      } else if (key === '.' || key === ',') {
        e.preventDefault();
        setCalcState((prev) => inputDecimal(prev));
      } else if (key === '+') {
        e.preventDefault();
        setCalcState((prev) => performOperation(prev, '+'));
      } else if (key === '-') {
        e.preventDefault();
        setCalcState((prev) => performOperation(prev, '-'));
      } else if (key === '*') {
        e.preventDefault();
        setCalcState((prev) => performOperation(prev, '*'));
      } else if (key === '/') {
        e.preventDefault();
        setCalcState((prev) => performOperation(prev, '/'));
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        setCalcState((prev) => calculateEquals(prev));
      } else if (key === 'Backspace') {
        e.preventDefault();
        setCalcState((prev) => backspace(prev));
      } else if (key === 'Escape') {
        e.preventDefault();
        setCalcState((prev) => clearAll(prev));
      } else if (key === '%') {
        e.preventDefault();
        setCalcState((prev) => inputPercent(prev));
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const copyResultToClipboard = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(calcState.displayValue);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    }
  };

  const loadHistoryItem = (result: string) => {
    if (calcState.isError) {
      setCalcState({
        ...INITIAL_CALCULATOR_STATE,
        displayValue: result,
        history: calcState.history,
        memory: calcState.memory,
      });
    } else {
      setCalcState((prev) => ({
        ...prev,
        displayValue: result,
        waitingForOperand: false,
      }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <CalculatorIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Calculatrice Web
              {calcState.memory !== 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                  M = {calcState.memory}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Calculatrice rapide, gestion de la mémoire, historique et raccourcis clavier
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              showShortcuts
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Raccourcis</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              showHistory
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historique ({calcState.history.length})</span>
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Helper Drawer */}
      {showShortcuts && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2 animate-fadeIn">
          <div className="font-bold text-slate-100 flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-blue-400" />
            <span>Guide des raccourcis clavier :</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-400">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-blue-400 font-bold">0 - 9</span> : Saisir un chiffre
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-blue-400 font-bold">+ - * /</span> : Opérateurs
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-blue-400 font-bold">Entrée / =</span> : Calculer
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-blue-400 font-bold">Effacer</span> : Esc (Tout) / Backspace (←)
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Calculator Body + History Drawer */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Calculator Display & Keypad */}
        <div className={`space-y-4 ${showHistory ? 'md:col-span-7 lg:col-span-8' : 'md:col-span-12'}`}>
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            {/* Display Area */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-right space-y-1 relative group overflow-hidden">
              {/* Copy Notification */}
              {copiedToast && (
                <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 animate-fadeIn">
                  <Check className="w-3 h-3" />
                  <span>Copié dans le presse-papier !</span>
                </div>
              )}

              {/* Copy Button */}
              <button
                type="button"
                onClick={copyResultToClipboard}
                title="Copier le résultat"
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {/* Expression line */}
              <div className="text-xs font-mono text-slate-500 min-h-[1.25rem] truncate px-1">
                {calcState.expression || '\u00A0'}
              </div>

              {/* Main Display Number */}
              <div
                className={`font-mono font-bold tracking-tight break-all transition-all ${
                  calcState.isError
                    ? 'text-rose-400 text-lg sm:text-xl'
                    : calcState.displayValue.length > 12
                    ? 'text-xl sm:text-2xl text-slate-100'
                    : 'text-3xl sm:text-4xl text-slate-100'
                }`}
              >
                {calcState.displayValue}
              </div>
            </div>

            {/* Memory Bar Buttons */}
            <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setCalcState((prev) => memoryClear(prev))}
                disabled={calcState.memory === 0}
                className="py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-30 border border-slate-800 text-amber-400 font-bold transition cursor-pointer disabled:cursor-not-allowed"
              >
                MC
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => memoryRecall(prev))}
                disabled={calcState.memory === 0}
                className="py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-30 border border-slate-800 text-amber-400 font-bold transition cursor-pointer disabled:cursor-not-allowed"
              >
                MR
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => memoryAdd(prev))}
                className="py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold transition cursor-pointer"
              >
                M+
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => memorySubtract(prev))}
                className="py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold transition cursor-pointer"
              >
                M-
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => ({ ...prev, memory: parseFloat(prev.displayValue) || 0 }))}
                className="py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold transition cursor-pointer"
              >
                MS
              </button>
            </div>

            {/* Main Keypad Grid */}
            <div className="grid grid-cols-4 gap-2 font-mono text-base font-bold">
              {/* Row 1: Function Keys */}
              <button
                type="button"
                onClick={() => setCalcState((prev) => clearAll(prev))}
                className="py-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer active:scale-95"
              >
                AC
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => clearEntry(prev))}
                className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer active:scale-95"
              >
                CE
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => backspace(prev))}
                title="Effacer le dernier caractère"
                className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Delete className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => performOperation(prev, '/'))}
                className={`py-3.5 rounded-2xl border transition cursor-pointer active:scale-95 ${
                  calcState.operation === '/' && calcState.waitingForOperand
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border-blue-700/50'
                }`}
              >
                ÷
              </button>

              {/* Row 2: 7, 8, 9, * */}
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '7'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '8'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '9'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => performOperation(prev, '*'))}
                className={`py-3.5 rounded-2xl border transition cursor-pointer active:scale-95 ${
                  calcState.operation === '*' && calcState.waitingForOperand
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border-blue-700/50'
                }`}
              >
                ×
              </button>

              {/* Row 3: 4, 5, 6, - */}
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '4'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '5'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '6'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => performOperation(prev, '-'))}
                className={`py-3.5 rounded-2xl border transition cursor-pointer active:scale-95 ${
                  calcState.operation === '-' && calcState.waitingForOperand
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border-blue-700/50'
                }`}
              >
                -
              </button>

              {/* Row 4: 1, 2, 3, + */}
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '1'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '2'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '3'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => performOperation(prev, '+'))}
                className={`py-3.5 rounded-2xl border transition cursor-pointer active:scale-95 ${
                  calcState.operation === '+' && calcState.waitingForOperand
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border-blue-700/50'
                }`}
              >
                +
              </button>

              {/* Row 5: ±, 0, ., = */}
              <button
                type="button"
                onClick={() => setCalcState((prev) => toggleSign(prev))}
                className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer active:scale-95"
              >
                ±
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDigit(prev, '0'))}
                className="py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-xs transition cursor-pointer active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => inputDecimal(prev))}
                className="py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer active:scale-95"
              >
                .
              </button>
              <button
                type="button"
                onClick={() => setCalcState((prev) => calculateEquals(prev))}
                className="py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 font-bold shadow-lg shadow-blue-500/25 transition cursor-pointer active:scale-95"
              >
                =
              </button>
            </div>
          </div>
        </div>

        {/* Calculation History Drawer */}
        {showHistory && (
          <div className="md:col-span-5 lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                <History className="w-4 h-4 text-blue-400" />
                <span>Historique des calculs</span>
              </div>

              {calcState.history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCalcState((prev) => clearHistory(prev))}
                  title="Effacer l'historique"
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {calcState.history.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 space-y-2">
                <CalculatorIcon className="w-8 h-8 mx-auto text-slate-700" />
                <p>Aucun calcul dans l’historique.</p>
                <p className="text-[11px] text-slate-600">Effectuez une opération pour la voir apparaître ici.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {calcState.history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadHistoryItem(item.result)}
                    className="w-full text-left bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 transition group cursor-pointer space-y-1"
                  >
                    <div className="text-[11px] font-mono text-slate-400 group-hover:text-blue-400 transition-colors">
                      {item.expression}
                    </div>
                    <div className="text-sm font-mono font-bold text-slate-100">
                      {item.result}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
