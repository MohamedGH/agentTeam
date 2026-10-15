export type CalculatorMode = 'standard' | 'scientific';

export interface CalculatorHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

export interface CalculatorState {
  display: string;
  expression: string;
  memory: number;
  history: CalculatorHistoryItem[];
  mode: CalculatorMode;
  isNewInput: boolean;
  error: string | null;
}

export const INITIAL_CALCULATOR_STATE: CalculatorState = {
  display: '0',
  expression: '',
  memory: 0,
  history: [],
  mode: 'standard',
  isNewInput: true,
  error: null,
};

export function formatNumber(val: number): string {
  if (isNaN(val)) return 'Error';
  if (!isFinite(val)) return val > 0 ? 'Infinity' : '-Infinity';
  if (Math.abs(val) < 1e-10 && val !== 0) return '0';

  // Prevent excess floating point precision artifacts like 0.1 + 0.2 = 0.30000000000000004
  const rounded = Number(Math.round(Number(val + 'e+12')) + 'e-12');
  const str = rounded.toString();

  // If number is huge or tiny exponential
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-7)) {
    return rounded.toExponential(6).replace(/\.0+e/, 'e');
  }

  return str;
}

export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error('Invalid input for factorial');
  }
  if (n > 170) {
    throw new Error('Overflow');
  }
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

export function calculateBasic(a: number, b: number, op: '+' | '-' | '*' | '/' | '^' | '%'): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) throw new Error('Cannot divide by zero');
      return a / b;
    case '^':
      return Math.pow(a, b);
    case '%':
      if (b === 0) throw new Error('Cannot divide by zero');
      return a % b;
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}

export function calculateUnary(
  num: number,
  op: 'sqrt' | 'square' | 'factorial' | 'negate' | 'reciprocal' | 'percent' | 'sin' | 'cos' | 'tan' | 'log' | 'ln'
): number {
  switch (op) {
    case 'sqrt':
      if (num < 0) throw new Error('Invalid input for square root');
      return Math.sqrt(num);
    case 'square':
      return num * num;
    case 'factorial':
      return factorial(num);
    case 'negate':
      return -num;
    case 'reciprocal':
      if (num === 0) throw new Error('Cannot divide by zero');
      return 1 / num;
    case 'percent':
      return num / 100;
    case 'sin':
      return Math.sin((num * Math.PI) / 180);
    case 'cos':
      return Math.cos((num * Math.PI) / 180);
    case 'tan': {
      const rad = (num * Math.PI) / 180;
      if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error('Tangent undefined');
      return Math.tan(rad);
    }
    case 'log':
      if (num <= 0) throw new Error('Invalid input for logarithm');
      return Math.log10(num);
    case 'ln':
      if (num <= 0) throw new Error('Invalid input for logarithm');
      return Math.log(num);
    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}

/**
 * Safely evaluates mathematical expression string supporting +, -, *, /, ^, %, parentheses, and functions.
 */
export function evaluateExpression(expression: string): { result: number; formatted: string } {
  const sanitized = expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, Math.PI.toString())
    .replace(/\be\b/g, Math.E.toString())
    .trim();

  if (!sanitized) {
    return { result: 0, formatted: '0' };
  }

  // Tokenize & Parse expression using Shunting-yard algorithm
  const tokens = tokenize(sanitized);
  const rpn = shuntingYard(tokens);
  const result = evaluateRPN(rpn);

  if (isNaN(result) || !isFinite(result)) {
    throw new Error('Calculation error');
  }

  return {
    result,
    formatted: formatNumber(result),
  };
}

interface Token {
  type: 'NUMBER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'FUNCTION';
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/\d|\./.test(char)) {
      let numStr = '';
      while (i < input.length && (/\d|\./.test(input[i]) || (input[i] === 'e' && /\d|-|\+/.test(input[i + 1] || '')))) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    if (['+', '-', '*', '/', '^', '%'].includes(char)) {
      // Check for unary minus
      const prevToken = tokens[tokens.length - 1];
      const isUnary =
        char === '-' &&
        (!prevToken || prevToken.type === 'OPERATOR' || prevToken.type === 'LPAREN');

      if (isUnary) {
        // Read the number following unary minus
        i++;
        if (i < input.length && (/\d|\./.test(input[i]))) {
          let numStr = '-';
          while (i < input.length && /\d|\./.test(input[i])) {
            numStr += input[i];
            i++;
          }
          tokens.push({ type: 'NUMBER', value: numStr });
          continue;
        } else {
          tokens.push({ type: 'NUMBER', value: '-1' });
          tokens.push({ type: 'OPERATOR', value: '*' });
          continue;
        }
      }

      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    // Identifiers for functions (sin, cos, tan, sqrt, log, ln)
    if (/[a-zA-Z]/.test(char)) {
      let funcStr = '';
      while (i < input.length && /[a-zA-Z]/.test(input[i])) {
        funcStr += input[i];
        i++;
      }
      tokens.push({ type: 'FUNCTION', value: funcStr.toLowerCase() });
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  '^': 3,
};

function shuntingYard(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'NUMBER') {
      outputQueue.push(token);
    } else if (token.type === 'FUNCTION') {
      operatorStack.push(token);
    } else if (token.type === 'OPERATOR') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== 'LPAREN' &&
        (PRECEDENCE[operatorStack[operatorStack.length - 1].value] > PRECEDENCE[token.value] ||
          (PRECEDENCE[operatorStack[operatorStack.length - 1].value] === PRECEDENCE[token.value] &&
            token.value !== '^'))
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Mismatched parentheses');
      }
      operatorStack.pop(); // Pop LPAREN
      if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'FUNCTION') {
        outputQueue.push(operatorStack.pop()!);
      }
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

function evaluateRPN(rpn: Token[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === 'NUMBER') {
      const val = parseFloat(token.value);
      if (isNaN(val)) throw new Error(`Invalid number: ${token.value}`);
      stack.push(val);
    } else if (token.type === 'OPERATOR') {
      if (stack.length < 2) throw new Error('Invalid expression format');
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(calculateBasic(a, b, token.value as any));
    } else if (token.type === 'FUNCTION') {
      if (stack.length < 1) throw new Error('Invalid function call format');
      const arg = stack.pop()!;
      stack.push(calculateUnary(arg, token.value as any));
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression state');
  }

  return stack[0];
}
