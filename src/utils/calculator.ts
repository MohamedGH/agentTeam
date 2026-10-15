export interface CalculationResult {
  success: boolean;
  value?: number;
  formattedResult?: string;
  error?: string;
}

export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

/**
 * Rounds a floating point number to handle binary floating-point inaccuracies
 * e.g., 0.1 + 0.2 = 0.30000000000000004 -> 0.3
 */
export function roundPrecision(val: number, precision: number = 10): number {
  if (!Number.isFinite(val)) return val;
  const factor = Math.pow(10, precision);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Format calculation result number cleanly
 */
export function formatResultNumber(val: number): string {
  if (Object.is(val, -0)) val = 0;
  if (!Number.isFinite(val)) {
    if (Number.isNaN(val)) return 'Error';
    return val > 0 ? 'Infinity' : '-Infinity';
  }
  const rounded = roundPrecision(val, 10);
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
    return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return String(rounded);
}

interface Token {
  type: 'NUMBER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'FUNCTION' | 'COMMA';
  value: string;
}

/**
 * Tokenize math expression string into structured tokens
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const expr = expression.trim();

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Number or decimal point
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      let hasDot = false;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === '.') {
          if (hasDot) break;
          hasDot = true;
        }
        numStr += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    // Identifiers (functions or constants like pi, e, sqrt, sin, cos, tan, log, ln, abs)
    if (/[a-zA-Z]/.test(char)) {
      let idStr = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        idStr += expr[i];
        i++;
      }
      const lower = idStr.toLowerCase();
      if (lower === 'pi') {
        tokens.push({ type: 'NUMBER', value: String(Math.PI) });
      } else if (lower === 'e') {
        tokens.push({ type: 'NUMBER', value: String(Math.E) });
      } else if (['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs', 'floor', 'ceil', 'round', 'asin', 'acos', 'atan'].includes(lower)) {
        tokens.push({ type: 'FUNCTION', value: lower });
      } else {
        throw new Error(`Unknown function or identifier: ${idStr}`);
      }
      continue;
    }

    // Parentheses & comma
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
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }

    // Operators: +, -, *, /, %, ^
    if (['+', '-', '*', '/', '%', '^'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

/**
 * Shunting-yard algorithm to convert infix tokens to Reverse Polish Notation (RPN)
 */
function parseRPN(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
    '^': 3,
  };

  const rightAssociative: Record<string, boolean> = {
    '^': true,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'NUMBER') {
      outputQueue.push(token);
    } else if (token.type === 'FUNCTION') {
      operatorStack.push(token);
    } else if (token.type === 'OPERATOR') {
      // Check for unary minus / plus
      const prevToken = i > 0 ? tokens[i - 1] : null;
      const isUnary =
        (token.value === '-' || token.value === '+') &&
        (!prevToken || prevToken.type === 'OPERATOR' || prevToken.type === 'LPAREN' || prevToken.type === 'COMMA');

      if (isUnary) {
        if (token.value === '-') {
          // Represent unary minus as function or number zero minus
          operatorStack.push({ type: 'FUNCTION', value: 'neg' });
        }
        // Unary plus does nothing
        continue;
      }

      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top.type === 'OPERATOR') {
          const p1 = precedence[token.value] || 0;
          const p2 = precedence[top.value] || 0;
          if (p2 > p1 || (p2 === p1 && !rightAssociative[token.value])) {
            outputQueue.push(operatorStack.pop()!);
            continue;
          }
        } else if (top.type === 'FUNCTION') {
          outputQueue.push(operatorStack.pop()!);
          continue;
        }
        break;
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      let foundLParen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack.pop()!;
        if (top.type === 'LPAREN') {
          foundLParen = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundLParen) {
        throw new Error('Mismatched parentheses: extra closing parenthesis');
      }
      if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'FUNCTION') {
        outputQueue.push(operatorStack.pop()!);
      }
    } else if (token.type === 'COMMA') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
        outputQueue.push(operatorStack.pop()!);
      }
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      throw new Error('Mismatched parentheses: unclosed parenthesis');
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

/**
 * Evaluate Reverse Polish Notation (RPN) queue
 */
function evaluateRPN(rpn: Token[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === 'NUMBER') {
      const num = parseFloat(token.value);
      if (Number.isNaN(num)) throw new Error(`Invalid number token: ${token.value}`);
      stack.push(num);
    } else if (token.type === 'OPERATOR') {
      if (stack.length < 2) throw new Error('Invalid expression: insufficient operands');
      const b = stack.pop()!;
      const a = stack.pop()!;

      switch (token.value) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) throw new Error('Division by zero');
          stack.push(a / b);
          break;
        case '%':
          if (b === 0) throw new Error('Division by zero');
          stack.push(a % b);
          break;
        case '^':
          stack.push(Math.pow(a, b));
          break;
        default:
          throw new Error(`Unsupported operator: ${token.value}`);
      }
    } else if (token.type === 'FUNCTION') {
      if (token.value === 'neg') {
        if (stack.length < 1) throw new Error('Invalid expression: missing operand for unary minus');
        const val = stack.pop()!;
        stack.push(-val);
        continue;
      }

      if (stack.length < 1) throw new Error(`Missing argument for function ${token.value}`);
      const val = stack.pop()!;

      switch (token.value) {
        case 'sqrt':
          if (val < 0) throw new Error('Invalid input for square root: negative number');
          stack.push(Math.sqrt(val));
          break;
        case 'sin':
          stack.push(Math.sin(val));
          break;
        case 'cos':
          stack.push(Math.cos(val));
          break;
        case 'tan':
          stack.push(Math.tan(val));
          break;
        case 'asin':
          if (val < -1 || val > 1) throw new Error('Domain error for asin: value must be between -1 and 1');
          stack.push(Math.asin(val));
          break;
        case 'acos':
          if (val < -1 || val > 1) throw new Error('Domain error for acos: value must be between -1 and 1');
          stack.push(Math.acos(val));
          break;
        case 'atan':
          stack.push(Math.atan(val));
          break;
        case 'log':
          if (val <= 0) throw new Error('Domain error for log: value must be greater than 0');
          stack.push(Math.log10(val));
          break;
        case 'ln':
          if (val <= 0) throw new Error('Domain error for ln: value must be greater than 0');
          stack.push(Math.log(val));
          break;
        case 'abs':
          stack.push(Math.abs(val));
          break;
        case 'floor':
          stack.push(Math.floor(val));
          break;
        case 'ceil':
          stack.push(Math.ceil(val));
          break;
        case 'round':
          stack.push(Math.round(val));
          break;
        default:
          throw new Error(`Unsupported function: ${token.value}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression: evaluation failed');
  }

  return stack[0];
}

/**
 * Main evaluation entry point
 */
export function evaluateExpression(expression: string): CalculationResult {
  if (!expression || typeof expression !== 'string' || expression.trim().length === 0) {
    return { success: false, error: 'Empty expression' };
  }

  try {
    // Standardize syntax: convert × and ÷ to * and /
    const sanitized = expression
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi');

    const tokens = tokenize(sanitized);
    if (tokens.length === 0) {
      return { success: false, error: 'Empty expression' };
    }

    const rpn = parseRPN(tokens);
    const rawVal = evaluateRPN(rpn);

    if (!Number.isFinite(rawVal)) {
      if (Number.isNaN(rawVal)) {
        return { success: false, error: 'Result is Not a Number (NaN)' };
      }
      return { success: false, error: 'Result exceeded numeric bounds (Overflow)' };
    }

    const roundedVal = roundPrecision(rawVal, 10);
    const formattedResult = formatResultNumber(roundedVal);

    return {
      success: true,
      value: roundedVal,
      formattedResult,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Invalid expression',
    };
  }
}
