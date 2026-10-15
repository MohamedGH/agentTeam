/**
 * Calculator Core Utility Logic
 * Pure state transition functions and calculation helpers for the Web Calculator application.
 */

export type CalculatorOperator = '+' | '-' | '*' | '/' | null;

export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: Date;
}

export interface CalculatorState {
  displayValue: string;
  previousValue: string | null;
  operator: CalculatorOperator;
  waitingForNewOperand: boolean;
  memory: number;
  history: CalculationHistoryItem[];
  hasError: boolean;
  errorMessage?: string;
}

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  displayValue: '0',
  previousValue: null,
  operator: null,
  waitingForNewOperand: false,
  memory: 0,
  history: [],
  hasError: false,
};

/**
 * Formats numbers nicely with precision handling to prevent floating point quirks (e.g. 0.1 + 0.2 = 0.3)
 */
export function formatCalculatorNumber(num: number): string {
  if (isNaN(num)) return 'Error';
  if (!isFinite(num)) return 'Error: Division by 0';

  // Format to avoid numbers like 0.30000000000000004
  const precisionClean = parseFloat(num.toPrecision(12));
  const str = precisionClean.toString();

  // If exponential notation for very large or tiny numbers
  if (Math.abs(precisionClean) >= 1e12 || (Math.abs(precisionClean) > 0 && Math.abs(precisionClean) < 1e-7)) {
    return precisionClean.toExponential();
  }

  return str;
}

/**
 * Calculates result based on operator and two operands
 */
export function evaluateOperation(op1: number, op2: number, operator: CalculatorOperator): { result: number; error?: string } {
  switch (operator) {
    case '+':
      return { result: op1 + op2 };
    case '-':
      return { result: op1 - op2 };
    case '*':
      return { result: op1 * op2 };
    case '/':
      if (op2 === 0) {
        return { result: NaN, error: 'Cannot divide by zero' };
      }
      return { result: op1 / op2 };
    default:
      return { result: op2 };
  }
}

export function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.hasError) {
    return {
      ...INITIAL_CALCULATOR_STATE,
      memory: state.memory,
      history: state.history,
      displayValue: digit,
    };
  }

  if (state.waitingForNewOperand) {
    return {
      ...state,
      displayValue: digit,
      waitingForNewOperand: false,
    };
  }

  const newDisplay = state.displayValue === '0' ? digit : state.displayValue + digit;
  // Limit display digits length to 16
  if (newDisplay.replace('-', '').replace('.', '').length > 16) {
    return state;
  }

  return {
    ...state,
    displayValue: newDisplay,
  };
}

export function inputDecimal(state: CalculatorState): CalculatorState {
  if (state.hasError) {
    return {
      ...INITIAL_CALCULATOR_STATE,
      memory: state.memory,
      history: state.history,
      displayValue: '0.',
    };
  }

  if (state.waitingForNewOperand) {
    return {
      ...state,
      displayValue: '0.',
      waitingForNewOperand: false,
    };
  }

  if (!state.displayValue.includes('.')) {
    return {
      ...state,
      displayValue: state.displayValue + '.',
    };
  }

  return state;
}

export function toggleSign(state: CalculatorState): CalculatorState {
  if (state.hasError || state.displayValue === '0') return state;

  const num = parseFloat(state.displayValue);
  if (isNaN(num)) return state;

  return {
    ...state,
    displayValue: formatCalculatorNumber(-num),
  };
}

export function applyPercentage(state: CalculatorState): CalculatorState {
  if (state.hasError) return state;

  const current = parseFloat(state.displayValue);
  if (isNaN(current)) return state;

  let val = current / 100;
  // If there's a previous value and operator, e.g. 200 + 10% = 200 + (200 * 0.1)
  if (state.previousValue !== null && (state.operator === '+' || state.operator === '-')) {
    const prev = parseFloat(state.previousValue);
    if (!isNaN(prev)) {
      val = prev * (current / 100);
    }
  }

  return {
    ...state,
    displayValue: formatCalculatorNumber(val),
  };
}

export function handleOperator(state: CalculatorState, nextOperator: CalculatorOperator): CalculatorState {
  if (state.hasError) return state;

  const inputValue = parseFloat(state.displayValue);

  if (state.previousValue === null) {
    return {
      ...state,
      previousValue: state.displayValue,
      operator: nextOperator,
      waitingForNewOperand: true,
    };
  }

  if (state.operator && state.waitingForNewOperand) {
    return {
      ...state,
      operator: nextOperator,
    };
  }

  const prevValue = parseFloat(state.previousValue);
  const { result, error } = evaluateOperation(prevValue, inputValue, state.operator);

  if (error) {
    return {
      ...state,
      hasError: true,
      errorMessage: error,
      displayValue: 'Error',
      previousValue: null,
      operator: null,
      waitingForNewOperand: true,
    };
  }

  const formattedResult = formatCalculatorNumber(result);
  const operatorSymbol = state.operator === '*' ? '×' : state.operator === '/' ? '÷' : state.operator;
  const historyEntry: CalculationHistoryItem = {
    id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    expression: `${state.previousValue} ${operatorSymbol} ${state.displayValue}`,
    result: formattedResult,
    timestamp: new Date(),
  };

  return {
    ...state,
    displayValue: formattedResult,
    previousValue: formattedResult,
    operator: nextOperator,
    waitingForNewOperand: true,
    history: [historyEntry, ...state.history].slice(0, 30), // keep last 30
  };
}

export function performEquals(state: CalculatorState): CalculatorState {
  if (state.hasError || state.operator === null || state.previousValue === null) {
    return state;
  }

  const inputValue = parseFloat(state.displayValue);
  const prevValue = parseFloat(state.previousValue);

  const { result, error } = evaluateOperation(prevValue, inputValue, state.operator);

  if (error) {
    return {
      ...state,
      hasError: true,
      errorMessage: error,
      displayValue: 'Error',
      previousValue: null,
      operator: null,
      waitingForNewOperand: true,
    };
  }

  const formattedResult = formatCalculatorNumber(result);
  const operatorSymbol = state.operator === '*' ? '×' : state.operator === '/' ? '÷' : state.operator;
  const historyEntry: CalculationHistoryItem = {
    id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    expression: `${state.previousValue} ${operatorSymbol} ${state.displayValue}`,
    result: formattedResult,
    timestamp: new Date(),
  };

  return {
    ...state,
    displayValue: formattedResult,
    previousValue: null,
    operator: null,
    waitingForNewOperand: true,
    history: [historyEntry, ...state.history].slice(0, 30),
  };
}

export function backspace(state: CalculatorState): CalculatorState {
  if (state.hasError || state.waitingForNewOperand) {
    return state;
  }

  if (state.displayValue.length <= 1 || (state.displayValue.length === 2 && state.displayValue.startsWith('-'))) {
    return {
      ...state,
      displayValue: '0',
    };
  }

  return {
    ...state,
    displayValue: state.displayValue.slice(0, -1),
  };
}

export function clearAll(state: CalculatorState): CalculatorState {
  return {
    ...INITIAL_CALCULATOR_STATE,
    memory: state.memory,
    history: state.history,
  };
}

export function memoryClear(state: CalculatorState): CalculatorState {
  return { ...state, memory: 0 };
}

export function memoryRecall(state: CalculatorState): CalculatorState {
  return {
    ...state,
    displayValue: formatCalculatorNumber(state.memory),
    waitingForNewOperand: false,
  };
}

export function memoryAdd(state: CalculatorState): CalculatorState {
  const current = parseFloat(state.displayValue);
  if (isNaN(current) || state.hasError) return state;
  return { ...state, memory: state.memory + current };
}

export function memorySubtract(state: CalculatorState): CalculatorState {
  const current = parseFloat(state.displayValue);
  if (isNaN(current) || state.hasError) return state;
  return { ...state, memory: state.memory - current };
}

export function clearHistory(state: CalculatorState): CalculatorState {
  return { ...state, history: [] };
}
