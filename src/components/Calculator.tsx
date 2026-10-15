import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CalculatorEngine,
  CalculatorState,
  MathOperator,
  CalculationHistoryItem,
} from '../utils/calculatorEngine';
import { Delete, History, Trash2, RotateCcw } from 'lucide-react';

export const Calculator: React.FC = () => {
  const engineRef = useRef<CalculatorEngine>(new CalculatorEngine());
  const [calcState, setCalcState] = useState<CalculatorState>(engineRef.current.getState());
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const updateState = () => {
    setCalcState(engineRef.current.getState());
  };

  const flashKey = (keyName: string) => {
    setActiveKey(keyName);
    setTimeout(() => {
      setActiveKey(null);
    }, 150);
  };

  const handleDigit = useCallback((digit: string) => {
    flashKey(digit);
    engineRef.current.inputDigit(digit);
    updateState();
  }, []);

  const handleDecimal = useCallback(() => {
    flashKey('.');
    engineRef.current.inputDecimal();
    updateState();
  }, []);

  const handleOp = useCallback((op: MathOperator) => {
    flashKey(op);
    engineRef.current.performOperation(op);
    updateState();
  }, []);

  const handleEquals = useCallback(() => {
    flashKey('=');
    engineRef.current.equals();
    updateState();
  }, []);

  const handleClear = useCallback(() => {
    flashKey('C');
    engineRef.current.clear();
    updateState();
  }, []);

  const handleClearEntry = useCallback(() => {
    flashKey('CE');
    engineRef.current.clearEntry();
    updateState();
  }, []);

  const handleBackspace = useCallback(() => {
    flashKey('backspace');
    engineRef.current.backspace();
    updateState();
  }, []);

  const handleToggleSign = useCallback(() => {
    flashKey('±');
    engineRef.current.toggleSign();
    updateState();
  }, []);

  const handlePercentage = useCallback(() => {
    flashKey('%');
    engineRef.current.percentage();
    updateState();
  }, []);

  const handleSquareRoot = useCallback(() => {
    flashKey('√');
    engineRef.current.squareRoot();
    updateState();
  }, []);

  const handleSquare = useCallback(() => {
    flashKey('x²');
    engineRef.current.square();
    updateState();
  }, []);

  const handleMemory = useCallback((action: 'MC' | 'MR' | 'M+' | 'M-') => {
    flashKey(action);
    switch (action) {
      case 'MC':
        engineRef.current.memoryClear();
        break;
      case 'MR':
        engineRef.current.memoryRecall();
        break;
      case 'M+':
        engineRef.current.memoryAdd();
        break;
      case 'M-':
        engineRef.current.memorySubtract();
        break;
    }
    updateState();
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input element
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      const key = e.key;

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        handleDigit(key);
      } else if (key === '.' || key === ',') {
        e.preventDefault();
        handleDecimal();
      } else if (key === '+') {
        e.preventDefault();
        handleOp('+');
      } else if (key === '-') {
        e.preventDefault();
        handleOp('-');
      } else if (key === '*' || key === 'x' || key === 'X') {
        e.preventDefault();
        handleOp('*');
      } else if (key === '/') {
        e.preventDefault();
        handleOp('/');
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (key === '%') {
        e.preventDefault();
        handlePercentage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleDigit,
    handleDecimal,
    handleOp,
    handleEquals,
    handleBackspace,
    handleClear,
    handlePercentage,
  ]);

  return (
    <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Calculator Body */}
      <div className={`lg:col-span-${showHistory ? '7' : '12'} max-w-md mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300`}>
        {/* Top Header / Status bar */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="text-xs font-semibold text-slate-400 ml-2 tracking-wide uppercase">
              Calculatrice
            </span>
          </div>

          <div className="flex items-center gap-2">
            {calcState.memory !== 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                M ({calcState.memory})
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                showHistory
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Historique des calculs"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Historique</span>
            </button>
          </div>
        </div>

        {/* Display Screen */}
        <div className="p-6 bg-slate-950/80 flex flex-col justify-end text-right min-h-[120px] select-all border-b border-slate-800/80">
          <div className="text-sm font-mono text-slate-400 min-h-[20px] overflow-x-auto whitespace-nowrap scrollbar-none">
            {calcState.expression || '\u00A0'}
          </div>
          <div
            className={`text-3xl sm:text-4xl font-mono font-bold tracking-tight overflow-x-auto whitespace-nowrap scrollbar-none mt-1 ${
              calcState.isError ? 'text-red-400' : 'text-slate-100'
            }`}
          >
            {calcState.displayValue}
          </div>
          {calcState.isError && calcState.errorMessage && (
            <div className="text-xs text-red-400/90 font-sans mt-1">
              {calcState.errorMessage}
            </div>
          )}
        </div>

        {/* Keypad Grid */}
        <div className="p-4 grid grid-cols-4 gap-2 bg-slate-900/90">
          {/* Row 1: Memory Row */}
          <button
            type="button"
            onClick={() => handleMemory('MC')}
            className={`py-2 rounded-lg text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'MC'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            MC
          </button>
          <button
            type="button"
            onClick={() => handleMemory('MR')}
            className={`py-2 rounded-lg text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'MR'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            MR
          </button>
          <button
            type="button"
            onClick={() => handleMemory('M+')}
            className={`py-2 rounded-lg text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'M+'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            M+
          </button>
          <button
            type="button"
            onClick={() => handleMemory('M-')}
            className={`py-2 rounded-lg text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'M-'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            M-
          </button>

          {/* Row 2: Scientific / Functions */}
          <button
            type="button"
            onClick={handleSquare}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'x²'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
          >
            x²
          </button>
          <button
            type="button"
            onClick={handleSquareRoot}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === '√'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
          >
            √x
          </button>
          <button
            type="button"
            onClick={handlePercentage}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === '%'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
          >
            %
          </button>
          <button
            type="button"
            onClick={handleClear}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer text-amber-400 ${
              activeKey === 'C'
                ? 'bg-amber-500/30 border-amber-400'
                : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30'
            }`}
          >
            C
          </button>

          {/* Row 3: Entry Clear, Toggle Sign, Backspace, Division */}
          <button
            type="button"
            onClick={handleClearEntry}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === 'CE'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
          >
            CE
          </button>
          <button
            type="button"
            onClick={handleToggleSign}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
              activeKey === '±'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
          >
            ±
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className={`py-2.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer flex items-center justify-center ${
              activeKey === 'backspace'
                ? 'bg-slate-700 text-white border-blue-400'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
            title="Effacer (Backspace)"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleOp('/')}
            className={`py-2.5 rounded-xl text-sm font-bold font-mono transition border cursor-pointer text-blue-400 ${
              activeKey === '/'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40'
            }`}
          >
            ÷
          </button>

          {/* Row 4: 7, 8, 9, Multiplication */}
          <button
            type="button"
            onClick={() => handleDigit('7')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '7'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleDigit('8')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '8'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleDigit('9')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '9'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleOp('*')}
            className={`py-3.5 rounded-xl text-sm font-bold font-mono transition border cursor-pointer text-blue-400 ${
              activeKey === '*'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40'
            }`}
          >
            ×
          </button>

          {/* Row 5: 4, 5, 6, Subtraction */}
          <button
            type="button"
            onClick={() => handleDigit('4')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '4'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleDigit('5')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '5'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleDigit('6')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '6'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleOp('-')}
            className={`py-3.5 rounded-xl text-sm font-bold font-mono transition border cursor-pointer text-blue-400 ${
              activeKey === '-'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40'
            }`}
          >
            −
          </button>

          {/* Row 6: 1, 2, 3, Addition */}
          <button
            type="button"
            onClick={() => handleDigit('1')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '1'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleDigit('2')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '2'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleDigit('3')}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '3'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleOp('+')}
            className={`py-3.5 rounded-xl text-sm font-bold font-mono transition border cursor-pointer text-blue-400 ${
              activeKey === '+'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40'
            }`}
          >
            +
          </button>

          {/* Row 7: 0, ., Equals */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className={`col-span-2 py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '0'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDecimal}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer ${
              activeKey === '.'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-100 border-slate-700/50'
            }`}
          >
            .
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className={`py-3.5 rounded-xl text-base font-bold font-mono transition border cursor-pointer shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-400 ${
              activeKey === '=' ? 'scale-98 ring-2 ring-blue-400' : ''
            }`}
          >
            =
          </button>
        </div>
      </div>

      {/* History Side Panel */}
      {showHistory && (
        <div className="lg:col-span-5 w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[520px]">
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-slate-200">Historique des calculs</h3>
            </div>
            {calcState.history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  engineRef.current.clearHistory();
                  updateState();
                }}
                className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 transition cursor-pointer"
                title="Vider l'historique"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Effacer</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {calcState.history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-12">
                <RotateCcw className="w-8 h-8 text-slate-600 mb-2 opacity-60" />
                <p>Aucun calcul dans l'historique</p>
              </div>
            ) : (
              calcState.history.map((item: CalculationHistoryItem) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    engineRef.current.loadHistoryItem(item);
                    updateState();
                  }}
                  className="w-full text-right p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/40 transition group cursor-pointer"
                >
                  <div className="text-xs font-mono text-slate-400 group-hover:text-slate-300">
                    {item.expression}
                  </div>
                  <div className="text-lg font-mono font-bold text-blue-400 group-hover:text-blue-300">
                    {item.result}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
