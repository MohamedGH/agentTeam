import {
  calculateBasic,
  calculateUnary,
  evaluateExpression,
  formatNumber,
  factorial,
} from '../../src/utils/calculator';

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`[FAIL] ${message}: expected "${expected}", got "${actual}"`);
  }
  console.log(`  ✓ ${message}`);
}

function assertCloseTo(actual: number, expected: number, tolerance = 1e-6, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`[FAIL] ${message}: expected close to ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${message}`);
}

function assertThrows(fn: () => void, expectedErrorSubstring: string, message: string) {
  try {
    fn();
    throw new Error(`[FAIL] ${message}: expected exception containing "${expectedErrorSubstring}", but none was thrown.`);
  } catch (err: any) {
    if (err.message && err.message.includes('[FAIL]')) {
      throw err;
    }
    if (!err.message || !err.message.includes(expectedErrorSubstring)) {
      throw new Error(`[FAIL] ${message}: expected exception containing "${expectedErrorSubstring}", got "${err.message}"`);
    }
    console.log(`  ✓ ${message} (Threw: "${err.message}")`);
  }
}

export async function runCalculatorUnitTests() {
  console.log('\n--- Running Calculator Utility Unit Tests ---');

  // 1. Basic Operations
  assertEqual(calculateBasic(10, 5, '+'), 15, 'Basic Addition (10 + 5)');
  assertEqual(calculateBasic(10, 5, '-'), 5, 'Basic Subtraction (10 - 5)');
  assertEqual(calculateBasic(10, 5, '*'), 50, 'Basic Multiplication (10 * 5)');
  assertEqual(calculateBasic(10, 5, '/'), 2, 'Basic Division (10 / 5)');
  assertEqual(calculateBasic(2, 3, '^'), 8, 'Exponentiation (2 ^ 3)');
  assertEqual(calculateBasic(10, 3, '%'), 1, 'Modulo (10 % 3)');

  // 2. Unary Operations
  assertEqual(calculateUnary(9, 'sqrt'), 3, 'Square Root (sqrt(9))');
  assertEqual(calculateUnary(4, 'square'), 16, 'Square (4^2)');
  assertEqual(calculateUnary(5, 'factorial'), 120, 'Factorial (5!)');
  assertEqual(calculateUnary(42, 'negate'), -42, 'Negation (-42)');
  assertEqual(calculateUnary(4, 'reciprocal'), 0.25, 'Reciprocal (1/4)');
  assertEqual(calculateUnary(50, 'percent'), 0.5, 'Percent (50%)');
  assertCloseTo(calculateUnary(30, 'sin'), 0.5, 1e-6, 'Trigonometric sin(30 deg)');
  assertCloseTo(calculateUnary(60, 'cos'), 0.5, 1e-6, 'Trigonometric cos(60 deg)');
  assertEqual(calculateUnary(100, 'log'), 2, 'Logarithm log10(100)');
  assertCloseTo(calculateUnary(Math.E, 'ln'), 1, 1e-6, 'Natural log ln(e)');

  // 3. Expression Evaluation Engine (Shunting-yard & RPN)
  assertEqual(evaluateExpression('2 + 3 * 4').result, 14, 'Precedence (2 + 3 * 4 = 14)');
  assertEqual(evaluateExpression('(2 + 3) * 4').result, 20, 'Parentheses ((2 + 3) * 4 = 20)');
  assertEqual(evaluateExpression('10 / 2 + 5').result, 10, 'Division and addition (10 / 2 + 5 = 10)');
  assertEqual(evaluateExpression('2 ^ 3 + 1').result, 9, 'Exponent precedence (2 ^ 3 + 1 = 9)');

  // 4. Formatting Tests
  assertEqual(formatNumber(0.1 + 0.2), '0.3', 'Floating point precision fix (0.1 + 0.2)');
  assertEqual(formatNumber(1000000), '1000000', 'Standard integer formatting');
  assertEqual(formatNumber(0), '0', 'Zero formatting');

  // 5. Error Handling & Edge Cases
  assertThrows(() => calculateBasic(10, 0, '/'), 'Cannot divide by zero', 'Error on division by zero');
  assertThrows(() => calculateUnary(-9, 'sqrt'), 'Invalid input for square root', 'Error on sqrt of negative number');
  assertThrows(() => calculateUnary(-1, 'factorial'), 'Invalid input for factorial', 'Error on factorial of negative number');
  assertThrows(() => evaluateExpression('(2 + 3'), 'Mismatched parentheses', 'Error on mismatched parentheses');

  console.log('✅ Calculator Unit Tests Passed (100%)\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('calculator.test')) {
  runCalculatorUnitTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
