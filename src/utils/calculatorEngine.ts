export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

export type MathOperator = '+' | '-' | '*' | '/';

export interface CalculatorState {
  displayValue: string;
  previousValue: number | null;
  operation: MathOperator | null;
  expression: string;
  waitingForOperand: boolean;
  memory: number;
  history: CalculationHistoryItem[];
  isError: boolean;
  errorMessage: string | null;
}

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  displayValue: '0',
  previousValue: null,
  operation: null,
  expression: '',
  waitingForOperand: false,
  memory: 0,
  history: [],
  isError: false,
  errorMessage: null,
};

export class CalculatorEngine {
  private state: CalculatorState;

  constructor(initialState?: Partial<CalculatorState>) {
    this.state = {
      ...INITIAL_CALCULATOR_STATE,
      ...initialState,
    };
  }

  public getState(): CalculatorState {
    return { ...this.state, history: [...this.state.history] };
  }

  public inputDigit(digit: string): CalculatorState {
    if (this.state.isError) {
      this.clear();
    }

    const { displayValue, waitingForOperand } = this.state;

    if (waitingForOperand) {
      this.state.displayValue = digit;
      this.state.waitingForOperand = false;
    } else {
      if (displayValue === '0') {
        this.state.displayValue = digit;
      } else {
        // Prevent overly long numbers
        if (displayValue.replace('-', '').replace('.', '').length >= 15) {
          return this.getState();
        }
        this.state.displayValue = displayValue + digit;
      }
    }

    return this.getState();
  }

  public inputDecimal(): CalculatorState {
    if (this.state.isError) {
      this.clear();
    }

    const { displayValue, waitingForOperand } = this.state;

    if (waitingForOperand) {
      this.state.displayValue = '0.';
      this.state.waitingForOperand = false;
    } else if (!displayValue.includes('.')) {
      this.state.displayValue = displayValue + '.';
    }

    return this.getState();
  }

  public clearEntry(): CalculatorState {
    if (this.state.isError) {
      return this.clear();
    }
    this.state.displayValue = '0';
    return this.getState();
  }

  public clear(): CalculatorState {
    this.state = {
      ...INITIAL_CALCULATOR_STATE,
      memory: this.state.memory,
      history: this.state.history,
    };
    return this.getState();
  }

  public clearAll(): CalculatorState {
    this.state = { ...INITIAL_CALCULATOR_STATE };
    return this.getState();
  }

  public backspace(): CalculatorState {
    if (this.state.isError || this.state.waitingForOperand) {
      return this.getState();
    }

    const { displayValue } = this.state;
    if (displayValue.length === 1 || (displayValue.length === 2 && displayValue.startsWith('-'))) {
      this.state.displayValue = '0';
    } else {
      this.state.displayValue = displayValue.slice(0, -1);
    }

    return this.getState();
  }

  public toggleSign(): CalculatorState {
    if (this.state.isError) return this.getState();

    const value = parseFloat(this.state.displayValue);
    if (isNaN(value) || value === 0) return this.getState();

    this.state.displayValue = (value * -1).toString();
    return this.getState();
  }

  public percentage(): CalculatorState {
    if (this.state.isError) return this.getState();

    const currentValue = parseFloat(this.state.displayValue);
    if (isNaN(currentValue)) return this.getState();

    let result = currentValue / 100;
    if (this.state.previousValue !== null && this.state.operation) {
      // e.g. 200 + 10% = 200 + (200 * 0.10)
      if (this.state.operation === '+' || this.state.operation === '-') {
        result = (this.state.previousValue * currentValue) / 100;
      }
    }

    this.state.displayValue = this.formatResult(result);
    return this.getState();
  }

  public squareRoot(): CalculatorState {
    if (this.state.isError) return this.getState();

    const value = parseFloat(this.state.displayValue);
    if (value < 0) {
      this.setError('Erreur: Racine carrée négative impossible');
      return this.getState();
    }

    const result = Math.sqrt(value);
    const resultStr = this.formatResult(result);
    this.addHistory(`√(${this.state.displayValue})`, resultStr);

    this.state.displayValue = resultStr;
    this.state.expression = `√(${value})`;
    this.state.waitingForOperand = true;
    return this.getState();
  }

  public square(): CalculatorState {
    if (this.state.isError) return this.getState();

    const value = parseFloat(this.state.displayValue);
    const result = value * value;
    const resultStr = this.formatResult(result);

    this.addHistory(`sqr(${this.state.displayValue})`, resultStr);

    this.state.displayValue = resultStr;
    this.state.expression = `sqr(${value})`;
    this.state.waitingForOperand = true;
    return this.getState();
  }

  public performOperation(nextOperation: MathOperator): CalculatorState {
    if (this.state.isError) return this.getState();

    const inputValue = parseFloat(this.state.displayValue);

    if (this.state.previousValue === null) {
      this.state.previousValue = inputValue;
    } else if (this.state.operation && !this.state.waitingForOperand) {
      const result = this.calculate(this.state.previousValue, inputValue, this.state.operation);
      if (result.error) {
        this.setError(result.error);
        return this.getState();
      }

      this.state.displayValue = this.formatResult(result.val!);
      this.state.previousValue = result.val!;
    }

    this.state.waitingForOperand = true;
    this.state.operation = nextOperation;
    const opSymbol = this.getSymbolForOp(nextOperation);
    this.state.expression = `${this.state.displayValue} ${opSymbol}`;

    return this.getState();
  }

  public equals(): CalculatorState {
    if (this.state.isError) return this.getState();

    const { previousValue, operation, displayValue } = this.state;

    if (previousValue === null || !operation) {
      return this.getState();
    }

    const inputValue = parseFloat(displayValue);
    const result = this.calculate(previousValue, inputValue, operation);

    if (result.error) {
      this.setError(result.error);
      return this.getState();
    }

    const resultStr = this.formatResult(result.val!);
    const opSymbol = this.getSymbolForOp(operation);
    const expr = `${this.formatResult(previousValue)} ${opSymbol} ${this.formatResult(inputValue)} =`;

    this.addHistory(expr, resultStr);

    this.state.expression = expr;
    this.state.displayValue = resultStr;
    this.state.previousValue = null;
    this.state.operation = null;
    this.state.waitingForOperand = true;

    return this.getState();
  }

  // Memory Operations
  public memoryClear(): CalculatorState {
    this.state.memory = 0;
    return this.getState();
  }

  public memoryRecall(): CalculatorState {
    if (this.state.isError) return this.getState();
    this.state.displayValue = this.formatResult(this.state.memory);
    this.state.waitingForOperand = true;
    return this.getState();
  }

  public memoryAdd(): CalculatorState {
    if (this.state.isError) return this.getState();
    const val = parseFloat(this.state.displayValue);
    if (!isNaN(val)) {
      this.state.memory += val;
      this.state.waitingForOperand = true;
    }
    return this.getState();
  }

  public memorySubtract(): CalculatorState {
    if (this.state.isError) return this.getState();
    const val = parseFloat(this.state.displayValue);
    if (!isNaN(val)) {
      this.state.memory -= val;
      this.state.waitingForOperand = true;
    }
    return this.getState();
  }

  public clearHistory(): CalculatorState {
    this.state.history = [];
    return this.getState();
  }

  public loadHistoryItem(item: CalculationHistoryItem): CalculatorState {
    this.state.displayValue = item.result;
    this.state.expression = item.expression;
    this.state.waitingForOperand = true;
    return this.getState();
  }

  private calculate(a: number, b: number, op: MathOperator): { val?: number; error?: string } {
    switch (op) {
      case '+':
        return { val: a + b };
      case '-':
        return { val: a - b };
      case '*':
        return { val: a * b };
      case '/':
        if (b === 0) {
          return { error: 'Division par zéro' };
        }
        return { val: a / b };
      default:
        return { val: b };
    }
  }

  private formatResult(num: number): string {
    if (!isFinite(num) || isNaN(num)) {
      return 'Erreur';
    }
    // Clean up precision issues like 0.1 + 0.2 = 0.30000000000000004
    const rounded = Number(Math.round(Number(num + 'e+12')) + 'e-12');
    const str = rounded.toString();
    if (str.length > 15) {
      return rounded.toExponential(8);
    }
    return str;
  }

  private setError(msg: string): void {
    this.state.isError = true;
    this.state.errorMessage = msg;
    this.state.displayValue = 'Erreur';
  }

  private getSymbolForOp(op: MathOperator): string {
    switch (op) {
      case '+':
        return '+';
      case '-':
        return '−';
      case '*':
        return '×';
      case '/':
        return '÷';
    }
  }

  private addHistory(expression: string, result: string): void {
    const newItem: CalculationHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      expression,
      result,
      timestamp: Date.now(),
    };
    this.state.history = [newItem, ...this.state.history].slice(0, 50);
  }
}
