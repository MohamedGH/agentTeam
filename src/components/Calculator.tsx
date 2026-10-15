import React, { useState, useEffect, useRef } from 'react';
import {
  Calculator as CalcIcon,
  RotateCcw,
  History,
  Trash2,
  Delete,
  Sparkles,
  ChevronRight,
  Divide,
  X,
  Minus,
  Plus,
  Equal,
} from 'lucide-react';
import {
  evaluateExpression,
  CalculatorError,
  CalculationHistoryItem,
  CalculatorEngine,
} from '../utils/calculator';

const engine = new CalculatorEngine();

export const Calculator: React.FC = () => {
  const [display, setDisplay] = useState<string>('0');
  const [expression, setExpression] = useState<string>('');
  const [mode, setMode] = useState<'standard' | 'scientific'>('standard');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [memory, setMemory] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEvaluated, setIsEvaluated] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(engine.getHistory());
    setMemory(engine.getMemory());
  }, []);

  // Handle button clicks
  const handleInput = (val: string) => {
    setErrorMessage(null);

    if (isEvaluated) {
      if (['+', '-', '*', '/', '%', '^'].includes(val)) {
        setExpression(display + val);
        setDisplay(display + val);
      } else {
        setExpression(val);
        setDisplay(val);
      }
      setIsEvaluated(false);
      return;
    }

    if (display === '0' && val !== '.' && !['+', '-', '*', '/', '%', '^'].includes(val)) {
      setDisplay(val);
      setExpression(val);
    } else {
      setDisplay((prev) => prev + val);
      setExpression((prev) => prev + val);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setExpression('');
    setErrorMessage(null);
    setIsEvaluated(false);
  };

  const handleDelete = () => {
    setErrorMessage(null);
    if (isEvaluated) {
      handleClear();
      return;
    }
    if (display.length <= 1) {
      setDisplay('0');
      setExpression('');
    } else {
      setDisplay((prev) => prev.slice(0, -1));
      setExpression((prev) => prev.slice(0, -1));
    }
  };

  const handleEvaluate = () => {
    if (!expression.trim()) return;
    try {
      setErrorMessage(null);
      const res = engine.calculate(expression);
      const formattedRes = String(res);
      setDisplay(formattedRes);
      setHistory(engine.getHistory());
      setIsEvaluated(true);
    } catch (err: any) {
      if (err instanceof CalculatorError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Syntax or Calculation Error');
      }
    }
  };

  // Scientific function appenders
  const handleScientificFunc = (funcName: string) => {
    setErrorMessage(null);
    if (isEvaluated) {
      setExpression(`${funcName}(${display})`);
      setDisplay(`${funcName}(${display})`);
      setIsEvaluated(false);
    } else {
      setExpression((prev) => (prev === '0' || !prev ? `${funcName}(` : `${prev}${funcName}(`));
      setDisplay((prev) => (prev === '0' || !prev ? `${funcName}(` : `${prev}${funcName}(`));
    }
  };

  // Memory operations
  const handleMemoryClear = () => {
    engine.memoryClear();
    setMemory(0);
  };

  const handleMemoryRecall = () => {
    const mem = engine.memoryRecall();
    setDisplay(String(mem));
    setExpression(String(mem));
    setIsEvaluated(false);
  };

  const handleMemoryAdd = () => {
    try {
      const val = Number(display);
      if (!isNaN(val)) {
        const newMem = engine.memoryAdd(val);
        setMemory(newMem);
      }
    } catch (e) {
      // Ignore
    }
  };

  const handleMemorySubtract = () => {
    try {
      const val = Number(display);
      if (!isNaN(val)) {
        const newMem = engine.memorySubtract(val);
        setMemory(newMem);
      }
    } catch (e) {
      // Ignore
    }
  };

  const handleClearHistory = () => {
    engine.clearHistory();
    setHistory([]);
  };

  const handleRecallHistory = (item: CalculationHistoryItem) => {
    setDisplay(String(item.result));
    setExpression(item.expression);
    setIsEvaluated(true);
  };

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input or textarea elsewhere
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleInput(e.key);
      } else if (e.key === '.') {
        handleInput('.');
      } else if (e.key === '+') {
        handleInput('+');
      } else if (e.key === '-') {
        handleInput('-');
      } else if (e.key === '*') {
        handleInput('*');
      } else if (e.key === '/') {
        e.preventDefault();
        handleInput('/');
      } else if (e.key === '%') {
        handleInput('%');
      } else if (e.key === '^') {
        handleInput('^');
      } else if (e.key === '(' || e.key === ')') {
        handleInput(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [display, expression, isEvaluated]);

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md max-w-2xl w-full mx-auto"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <CalcIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Calculatrice Graphique & Scientifique
            </h3>
            <p className="text-[11px] text-slate-400">Moteur de calcul haute précision</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                mode === 'standard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setMode('scientific')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                mode === 'scientific' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scientifique
            </button>
          </div>

          {/* History Toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              showHistory
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Historique des calculs"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Screen Display */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between min-h-[100px] shadow-inner font-mono relative overflow-hidden">
          {/* Top Expression line */}
          <div className="text-right text-xs text-slate-400 min-h-[18px] break-all">
            {expression || ' '}
          </div>

          {/* Primary Result / Input display */}
          <div className="text-right text-2xl sm:text-3xl font-bold text-white tracking-wider break-all mt-1">
            {display}
          </div>

          {/* Error Message banner */}
          {errorMessage && (
            <div className="mt-2 text-xs font-sans text-rose-400 bg-rose-950/50 border border-rose-800/60 rounded-md px-2.5 py-1 flex items-center justify-between">
              <span>⚠️ {errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Memory Indicator */}
          {memory !== 0 && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-300 font-sans font-bold">
              M = {memory}
            </div>
          )}
        </div>

        {/* Main Body: Grid or History */}
        {showHistory ? (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 min-h-[280px] max-h-[340px] overflow-y-auto space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400 font-semibold">
              <span>Historique Récent ({history.length})</span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 text-rose-400 hover:text-rose-300 text-[11px] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Effacer
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-10">
                Aucun calcul enregistree dans l'historique.
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleRecallHistory(item)}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/40 transition group cursor-pointer flex items-center justify-between font-mono"
                  >
                    <div>
                      <div className="text-[11px] text-slate-400 group-hover:text-slate-300">
                        {item.expression}
                      </div>
                      <div className="text-sm font-bold text-blue-400 group-hover:text-blue-300">
                        = {item.result}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Memory Buttons */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={handleMemoryClear}
                className="py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition cursor-pointer"
              >
                MC
              </button>
              <button
                type="button"
                onClick={handleMemoryRecall}
                className="py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition cursor-pointer"
              >
                MR
              </button>
              <button
                type="button"
                onClick={handleMemoryAdd}
                className="py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition cursor-pointer"
              >
                M+
              </button>
              <button
                type="button"
                onClick={handleMemorySubtract}
                className="py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition cursor-pointer"
              >
                M-
              </button>
            </div>

            {/* Scientific Function Row (if mode === 'scientific') */}
            {mode === 'scientific' && (
              <div className="grid grid-cols-5 gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleScientificFunc('sin')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  sin
                </button>
                <button
                  type="button"
                  onClick={() => handleScientificFunc('cos')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  cos
                </button>
                <button
                  type="button"
                  onClick={() => handleScientificFunc('tan')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  tan
                </button>
                <button
                  type="button"
                  onClick={() => handleScientificFunc('sqrt')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  √
                </button>
                <button
                  type="button"
                  onClick={() => handleInput('^')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  x^y
                </button>

                <button
                  type="button"
                  onClick={() => handleScientificFunc('log')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  log
                </button>
                <button
                  type="button"
                  onClick={() => handleScientificFunc('ln')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  ln
                </button>
                <button
                  type="button"
                  onClick={() => handleInput('!')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  n!
                </button>
                <button
                  type="button"
                  onClick={() => handleInput('(')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  (
                </button>
                <button
                  type="button"
                  onClick={() => handleInput(')')}
                  className="py-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 font-semibold transition cursor-pointer"
                >
                  )
                </button>
              </div>
            )}

            {/* Standard Keypad Grid */}
            <div className="grid grid-cols-4 gap-2 font-mono text-base">
              {/* Row 1 */}
              <button
                type="button"
                onClick={handleClear}
                className="py-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-bold border border-rose-800/60 transition cursor-pointer"
              >
                C
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition cursor-pointer flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleInput('%')}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition cursor-pointer"
              >
                %
              </button>
              <button
                type="button"
                onClick={() => handleInput('/')}
                className="py-3 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 font-bold border border-blue-800/60 transition cursor-pointer"
              >
                ÷
              </button>

              {/* Row 2 */}
              <button
                type="button"
                onClick={() => handleInput('7')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => handleInput('8')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => handleInput('9')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => handleInput('*')}
                className="py-3 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 font-bold border border-blue-800/60 transition cursor-pointer"
              >
                ×
              </button>

              {/* Row 3 */}
              <button
                type="button"
                onClick={() => handleInput('4')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => handleInput('5')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => handleInput('6')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => handleInput('-')}
                className="py-3 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 font-bold border border-blue-800/60 transition cursor-pointer"
              >
                −
              </button>

              {/* Row 4 */}
              <button
                type="button"
                onClick={() => handleInput('1')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handleInput('2')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handleInput('3')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => handleInput('+')}
                className="py-3 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 font-bold border border-blue-800/60 transition cursor-pointer"
              >
                +
              </button>

              {/* Row 5 */}
              <button
                type="button"
                onClick={() => handleInput('0')}
                className="col-span-2 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleInput('.')}
                className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold border border-slate-800 transition cursor-pointer"
              >
                .
              </button>
              <button
                type="button"
                onClick={handleEvaluate}
                className="py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-blue-500/20 transition cursor-pointer"
              >
                =
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
