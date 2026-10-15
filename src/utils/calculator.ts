export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

export type CalculatorOperator = '+' | '-' | '*' | '/';

export interface CalculatorState {
  displayValue: string;
  prevValue: number | null;
  operation: CalculatorOperator | null;
  waitingForOperand: boolean;
  memory: number;
  expression: string;
  history: CalculationHistoryItem[];
  isError: boolean;
}

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  displayValue: '0',
  prevValue: null,
  operation: null,
  waitingForOperand: false,
  memory: 0,
  expression: '',
  history: [],
  isError: false,
};

/**
 * Helper to format float numbers cleanly without floating point precision artifacts
 * (e.g. 0.1 + 0.2 = 0.3 instead of 0.30000000000000004)
 */
export function formatResultNumber(num: number): string {
  if (!Number.isFinite(num)) {
    return 'Erreur';
  }
  // Standardize precision up to 10 decimal digits
  const str = num.toFixed(10);
  const parsed = parseFloat(str);
  return parsed.toString();
}

/**
 * Inputs a digit ('0'-'9') into the calculator state.
 */
export function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.isError) {
    return {
      ...INITIAL_CALCULATOR_STATE,
      history: state.history,
      memory: state.memory,
      displayValue: digit,
    };
  }

  if (state.waitingForOperand) {
    return {
      ...state,
      displayValue: digit,
      waitingForOperand: false,
    };
  }

  const newDisplay = state.displayValue === '0' ? digit : state.displayValue + digit;
  return {
    ...state,
    displayValue: newDisplay,
  };
}

/**
 * Inputs a decimal point into the current display value.
 */
export function inputDecimal(state: CalculatorState): CalculatorState {
  if (state.isError) {
    return {
      ...INITIAL_CALCULATOR_STATE,
      history: state.history,
      memory: state.memory,
      displayValue: '0.',
    };
  }

  if (state.waitingForOperand) {
    return {
      ...state,
      displayValue: '0.',
      waitingForOperand: false,
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

/**
 * Clears the entire calculation state except history and memory.
 */
export function clearAll(state: CalculatorState): CalculatorState {
  return {
    ...INITIAL_CALCULATOR_STATE,
    history: state.history,
    memory: state.memory,
  };
}

/**
 * Clears only the current entry on the display.
 */
export function clearEntry(state: CalculatorState): CalculatorState {
  if (state.isError) {
    return clearAll(state);
  }
  return {
    ...state,
    displayValue: '0',
  };
}

/**
 * Removes the last typed character from the current display value.
 */
export function backspace(state: CalculatorState): CalculatorState {
  if (state.isError || state.waitingForOperand) {
    return state;
  }

  if (state.displayValue.length <= 1) {
    return {
      ...state,
      displayValue: '0',
    };
  }

  const newDisplay = state.displayValue.slice(0, -1);
  return {
    ...state,
    displayValue: newDisplay === '-' || newDisplay === '' ? '0' : newDisplay,
  };
}

/**
 * Toggles the sign (+/-) of the current display value.
 */
export function toggleSign(state: CalculatorState): CalculatorState {
  if (state.isError) return state;

  const currentNum = parseFloat(state.displayValue);
  if (isNaN(currentNum) || currentNum === 0) return state;

  const toggled = -currentNum;
  return {
    ...state,
    displayValue: formatResultNumber(toggled),
  };
}

/**
 * Calculates percentage of current display value.
 */
export function inputPercent(state: CalculatorState): CalculatorState {
  if (state.isError) return state;

  const currentNum = parseFloat(state.displayValue);
  if (isNaN(currentNum)) return state;

  let resultNum: number;
  if (state.prevValue !== null && state.operation) {
    // If we have a pending operation like 100 + 10%, 10% means 10% of 100
    if (state.operation === '+' || state.operation === '-') {
      resultNum = (state.prevValue * currentNum) / 100;
    } else {
      resultNum = currentNum / 100;
    }
  } else {
    resultNum = currentNum / 100;
  }

  return {
    ...state,
    displayValue: formatResultNumber(resultNum),
  };
}

/**
 * Executes pending math operation between a and b.
 */
export function calculateMath(a: number, b: number, op: CalculatorOperator): { result: number; error: string | null } {
  switch (op) {
    case '+':
      return { result: a + b, error: null };
    case '-':
      return { result: a - b, error: null };
    case '*':
      return { result: a * b, error: null };
    case '/':
      if (b === 0) {
        return { result: 0, error: 'Division par zéro impossible' };
      }
      return { result: a / b, error: null };
    default:
      return { result: b, error: null };
  }
}

/**
 * Sets or executes an operator (+, -, *, /).
 */
export function performOperation(state: CalculatorState, nextOp: CalculatorOperator): CalculatorState {
  if (state.isError) return state;

  const inputValue = parseFloat(state.displayValue);

  if (state.prevValue === null) {
    return {
      ...state,
      prevValue: inputValue,
      operation: nextOp,
      waitingForOperand: true,
      expression: `${state.displayValue} ${formatOperatorSymbol(nextOp)}`,
    };
  }

  if (state.waitingForOperand) {
    // Changing operator before entering second operand
    return {
      ...state,
      operation: nextOp,
      expression: `${formatResultNumber(state.prevValue)} ${formatOperatorSymbol(nextOp)}`,
    };
  }

  // Perform intermediate calculation
  const { result, error } = calculateMath(state.prevValue, inputValue, state.operation!);

  if (error) {
    return {
      ...state,
      displayValue: error,
      prevValue: null,
      operation: null,
      waitingForOperand: false,
      expression: '',
      isError: true,
    };
  }

  const formattedResult = formatResultNumber(result);

  return {
    ...state,
    displayValue: formattedResult,
    prevValue: result,
    operation: nextOp,
    waitingForOperand: true,
    expression: `${formattedResult} ${formatOperatorSymbol(nextOp)}`,
  };
}

/**
 * Computes final '=' evaluation.
 */
export function calculateEquals(state: CalculatorState): CalculatorState {
  if (state.isError || state.operation === null || state.prevValue === null) {
    return state;
  }

  const inputValue = parseFloat(state.displayValue);
  const { result, error } = calculateMath(state.prevValue, inputValue, state.operation);

  if (error) {
    return {
      ...state,
      displayValue: error,
      prevValue: null,
      operation: null,
      waitingForOperand: false,
      expression: '',
      isError: true,
    };
  }

  const formattedResult = formatResultNumber(result);
  const fullExpression = `${formatResultNumber(state.prevValue)} ${formatOperatorSymbol(state.operation)} ${state.displayValue} =`;

  const newHistoryItem: CalculationHistoryItem = {
    id: `calc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    expression: fullExpression,
    result: formattedResult,
    timestamp: Date.now(),
  };

  return {
    ...state,
    displayValue: formattedResult,
    prevValue: null,
    operation: null,
    waitingForOperand: true,
    expression: fullExpression,
    history: [newHistoryItem, ...state.history].slice(0, 50), // Keep up to 50 items
  };
}

/** Memory functions */
export function memoryClear(state: CalculatorState): CalculatorState {
  return { ...state, memory: 0 };
}

export function memoryRecall(state: CalculatorState): CalculatorState {
  if (state.isError) return state;
  const memoryStr = formatResultNumber(state.memory);
  return {
    ...state,
    displayValue: memoryStr,
    waitingForOperand: false,
  };
}

export function memoryAdd(state: CalculatorState): CalculatorState {
  if (state.isError) return state;
  const currentNum = parseFloat(state.displayValue);
  if (isNaN(currentNum)) return state;
  return { ...state, memory: state.memory + currentNum };
}

export function memorySubtract(state: CalculatorState): CalculatorState {
  if (state.isError) return state;
  const currentNum = parseFloat(state.displayValue);
  if (isNaN(currentNum)) return state;
  return { ...state, memory: state.memory - currentNum };
}

export function clearHistory(state: CalculatorState): CalculatorState {
  return { ...state, history: [] };
}

export function formatOperatorSymbol(op: CalculatorOperator): string {
  switch (op) {
    case '+': return '+';
    case '-': return '-';
    case '*': return '×';
    case '/': return '÷';
    default: return op;
  }
}
