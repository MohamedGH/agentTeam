/**
 * Calculator Utility Module
 * Core mathematical calculation engine supporting standard, scientific,
 * expression evaluation, memory operations, and calculation history.
 */

export type CalculationHistoryItem = {
  id: string;
  expression: string;
  result: number;
  timestamp: number;
};

export class CalculatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalculatorError';
  }
}

/**
 * Basic Arithmetic Operations
 */
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new CalculatorError('Division by zero is undefined');
  }
  return a / b;
}

export function modulo(a: number, b: number): number {
  if (b === 0) {
    throw new CalculatorError('Modulo by zero is undefined');
  }
  return a % b;
}

/**
 * Scientific & Advanced Operations
 */
export function power(base: number, exponent: number): number {
  const result = Math.pow(base, exponent);
  if (!isFinite(result) || isNaN(result)) {
    throw new CalculatorError('Result out of bounds or invalid exponentiation');
  }
  return result;
}

export function squareRoot(n: number): number {
  if (n < 0) {
    throw new CalculatorError('Cannot calculate square root of a negative number');
  }
  return Math.sqrt(n);
}

export function factorial(n: number): number {
  if (n < 0) {
    throw new CalculatorError('Factorial is undefined for negative numbers');
  }
  if (!Number.isInteger(n)) {
    throw new CalculatorError('Factorial requires an integer value');
  }
  if (n > 170) {
    throw new CalculatorError('Result overflow for factorial calculation');
  }
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

export function sinDegrees(angleInDegrees: number): number {
  const rad = (angleInDegrees * Math.PI) / 180;
  const val = Math.sin(rad);
  // Round tiny precision artifacts near 0
  return Math.abs(val) < 1e-15 ? 0 : val;
}

export function cosDegrees(angleInDegrees: number): number {
  const rad = (angleInDegrees * Math.PI) / 180;
  const val = Math.cos(rad);
  // Round tiny precision artifacts near 0
  return Math.abs(val) < 1e-15 ? 0 : val;
}

export function tanDegrees(angleInDegrees: number): number {
  if ((angleInDegrees - 90) % 180 === 0) {
    throw new CalculatorError('Tangent is undefined at 90° + k*180°');
  }
  const rad = (angleInDegrees * Math.PI) / 180;
  return Math.tan(rad);
}

export function log10(n: number): number {
  if (n <= 0) {
    throw new CalculatorError('Logarithm requires a positive number');
  }
  return Math.log10(n);
}

export function ln(n: number): number {
  if (n <= 0) {
    throw new CalculatorError('Natural logarithm requires a positive number');
  }
  return Math.log(n);
}

/**
 * Expression Evaluator (Shunting-yard / Safe Tokenizer & Parser)
 */
export function evaluateExpression(expr: string): number {
  const sanitized = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!sanitized) return 0;

  // Tokenize string safely into numbers, operators, parenthetical tokens, and scientific functions
  const tokens: string[] = [];
  let i = 0;

  while (i < sanitized.length) {
    const char = sanitized[i];

    // Numbers (including decimals)
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      while (i < sanitized.length && /[0-9.]/.test(sanitized[i])) {
        numStr += sanitized[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }

    // Identifiers (e.g. sqrt, sin, cos, tan, log, ln, pi, e)
    if (/[a-zA-Z]/.test(char)) {
      let ident = '';
      while (i < sanitized.length && /[a-zA-Z]/.test(sanitized[i])) {
        ident += sanitized[i];
        i++;
      }
      ident = ident.toLowerCase();
      if (ident === 'pi') {
        tokens.push(Math.PI.toString());
      } else if (ident === 'e') {
        tokens.push(Math.E.toString());
      } else if (['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'].includes(ident)) {
        tokens.push(ident);
      } else {
        throw new CalculatorError(`Unknown identifier: ${ident}`);
      }
      continue;
    }

    // Operators and Parentheses
    if (['+', '-', '*', '/', '%', '^', '(', ')', '!'].includes(char)) {
      // Handle unary minus
      if (
        char === '-' &&
        (tokens.length === 0 || ['+', '-', '*', '/', '%', '^', '('].includes(tokens[tokens.length - 1]))
      ) {
        // Read next number or constant as negative
        i++;
        if (i < sanitized.length && /[0-9.]/.test(sanitized[i])) {
          let numStr = '-';
          while (i < sanitized.length && /[0-9.]/.test(sanitized[i])) {
            numStr += sanitized[i];
            i++;
          }
          tokens.push(numStr);
          continue;
        } else {
          tokens.push('0');
          tokens.push('-');
          continue;
        }
      }

      tokens.push(char);
      i++;
      continue;
    }

    throw new CalculatorError(`Invalid character in expression: ${char}`);
  }

  // Parse token stream using standard operator precedence (Shunting-yard algorithm)
  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
    '^': 3,
    'sqrt': 4,
    'sin': 4,
    'cos': 4,
    'tan': 4,
    'log': 4,
    'ln': 4,
    'abs': 4,
    '!': 5,
  };

  const outputQueue: string[] = [];
  const operatorStack: string[] = [];

  for (const token of tokens) {
    if (!isNaN(Number(token))) {
      outputQueue.push(token);
    } else if (['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'].includes(token)) {
      operatorStack.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new CalculatorError('Mismatched parentheses in expression');
      }
      operatorStack.pop(); // Pop '('
      if (
        operatorStack.length > 0 &&
        ['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'].includes(operatorStack[operatorStack.length - 1])
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
    } else if (precedence[token] !== undefined) {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top === '(' || top === ')') {
      throw new CalculatorError('Mismatched parentheses in expression');
    }
    outputQueue.push(top);
  }

  // Evaluate Reverse Polish Notation (RPN)
  const valStack: number[] = [];

  for (const token of outputQueue) {
    if (!isNaN(Number(token))) {
      valStack.push(Number(token));
    } else if (token === '!') {
      const a = valStack.pop();
      if (a === undefined) throw new CalculatorError('Invalid expression format');
      valStack.push(factorial(a));
    } else if (['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'].includes(token)) {
      const a = valStack.pop();
      if (a === undefined) throw new CalculatorError('Invalid expression format');
      switch (token) {
        case 'sqrt':
          valStack.push(squareRoot(a));
          break;
        case 'sin':
          valStack.push(sinDegrees(a));
          break;
        case 'cos':
          valStack.push(cosDegrees(a));
          break;
        case 'tan':
          valStack.push(tanDegrees(a));
          break;
        case 'log':
          valStack.push(log10(a));
          break;
        case 'ln':
          valStack.push(ln(a));
          break;
        case 'abs':
          valStack.push(Math.abs(a));
          break;
      }
    } else {
      const b = valStack.pop();
      const a = valStack.pop();
      if (a === undefined || b === undefined) {
        throw new CalculatorError('Invalid expression format');
      }
      switch (token) {
        case '+':
          valStack.push(add(a, b));
          break;
        case '-':
          valStack.push(subtract(a, b));
          break;
        case '*':
          valStack.push(multiply(a, b));
          break;
        case '/':
          valStack.push(divide(a, b));
          break;
        case '%':
          valStack.push(modulo(a, b));
          break;
        case '^':
          valStack.push(power(a, b));
          break;
      }
    }
  }

  if (valStack.length !== 1) {
    throw new CalculatorError('Malformed expression');
  }

  const finalVal = valStack[0];
  if (!isFinite(finalVal) || isNaN(finalVal)) {
    throw new CalculatorError('Calculation produced an invalid numeric result');
  }

  // Round to avoiding IEEE 754 precision issues like 0.1 + 0.2 = 0.30000000000000004
  return Number(Math.round(Number(finalVal + 'e12')) + 'e-12');
}

/**
 * Calculator Engine Class for Stateful Operations
 */
export class CalculatorEngine {
  private memoryValue: number = 0;
  private history: CalculationHistoryItem[] = [];

  public getMemory(): number {
    return this.memoryValue;
  }

  public memoryClear(): void {
    this.memoryValue = 0;
  }

  public memoryRecall(): number {
    return this.memoryValue;
  }

  public memoryAdd(val: number): number {
    this.memoryValue += val;
    return this.memoryValue;
  }

  public memorySubtract(val: number): number {
    this.memoryValue -= val;
    return this.memoryValue;
  }

  public calculate(expression: string): number {
    const result = evaluateExpression(expression);
    const historyItem: CalculationHistoryItem = {
      id: `calc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      expression,
      result,
      timestamp: Date.now(),
    };
    this.history.unshift(historyItem);
    if (this.history.length > 50) {
      this.history.pop();
    }
    return result;
  }

  public getHistory(): CalculationHistoryItem[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
  }
}
