import assert from 'assert';
import {
  evaluateExpression,
  roundPrecision,
  formatResultNumber,
} from '../../src/utils/calculator';

export async function runCalculatorUnitTests() {
  console.log('\n--- [Unit Test] Calculator Engine & Math Evaluator ---');

  // 1. Basic Arithmetic
  {
    const r1 = evaluateExpression('2 + 3');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.value, 5);
    assert.strictEqual(r1.formattedResult, '5');

    const r2 = evaluateExpression('10 - 4');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.value, 6);

    const r3 = evaluateExpression('3 * 7');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.value, 21);

    const r4 = evaluateExpression('20 / 4');
    assert.strictEqual(r4.success, true);
    assert.strictEqual(r4.value, 5);

    const r5 = evaluateExpression('10 % 3');
    assert.strictEqual(r5.success, true);
    assert.strictEqual(r5.value, 1);

    console.log('✅ PASS: Basic arithmetic operations (+, -, *, /, %)');
  }

  // 2. Operator Precedence and Parentheses
  {
    const r1 = evaluateExpression('2 + 3 * 4');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.value, 14); // 3*4 = 12, 2+12 = 14

    const r2 = evaluateExpression('(2 + 3) * 4');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.value, 20);

    const r3 = evaluateExpression('2 ^ 3 + 1');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.value, 9); // 2^3 = 8, 8+1 = 9

    const r4 = evaluateExpression('2 * (3 + 4 * (5 - 2))');
    assert.strictEqual(r4.success, true);
    assert.strictEqual(r4.value, 30); // 5-2=3, 4*3=12, 3+12=15, 2*15=30

    console.log('✅ PASS: Operator precedence and nested parentheses');
  }

  // 3. Floating Point Precision
  {
    const r1 = evaluateExpression('0.1 + 0.2');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.value, 0.3);
    assert.strictEqual(r1.formattedResult, '0.3');

    const r2 = evaluateExpression('0.7 + 0.1');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.value, 0.8);

    console.log('✅ PASS: Floating point precision rounding');
  }

  // 4. Unary Minus and Negation
  {
    const r1 = evaluateExpression('-5 + 12');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.value, 7);

    const r2 = evaluateExpression('4 * -3');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.value, -12);

    const r3 = evaluateExpression('-(3 + 5)');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.value, -8);

    console.log('✅ PASS: Unary negation and negative operands');
  }

  // 5. Scientific Functions & Constants
  {
    const r1 = evaluateExpression('sqrt(16)');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.value, 4);

    const r2 = evaluateExpression('sin(0)');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.value, 0);

    const r3 = evaluateExpression('cos(0)');
    assert.strictEqual(r3.success, true);
    assert.strictEqual(r3.value, 1);

    const r4 = evaluateExpression('log(100)');
    assert.strictEqual(r4.success, true);
    assert.strictEqual(r4.value, 2);

    const r5 = evaluateExpression('abs(-42)');
    assert.strictEqual(r5.success, true);
    assert.strictEqual(r5.value, 42);

    const r6 = evaluateExpression('pi');
    assert.strictEqual(r6.success, true);
    assert.strictEqual(r6.value, roundPrecision(Math.PI, 10));

    console.log('✅ PASS: Scientific functions (sqrt, sin, cos, log, abs, constants)');
  }

  // 6. Error Handling
  {
    const divZero = evaluateExpression('10 / 0');
    assert.strictEqual(divZero.success, false);
    assert.strictEqual(divZero.error, 'Division by zero');

    const negSqrt = evaluateExpression('sqrt(-9)');
    assert.strictEqual(negSqrt.success, false);
    assert.strictEqual(negSqrt.error, 'Invalid input for square root: negative number');

    const unclosedParen = evaluateExpression('(2 + 3');
    assert.strictEqual(unclosedParen.success, false);
    assert.strictEqual(unclosedParen.error, 'Mismatched parentheses: unclosed parenthesis');

    const extraClosingParen = evaluateExpression('2 + 3)');
    assert.strictEqual(extraClosingParen.success, false);
    assert.strictEqual(extraClosingParen.error, 'Mismatched parentheses: extra closing parenthesis');

    const unknownToken = evaluateExpression('2 + foo(3)');
    assert.strictEqual(unknownToken.success, false);
    assert(unknownToken.error?.includes('Unknown function'));

    const empty = evaluateExpression('');
    assert.strictEqual(empty.success, false);
    assert.strictEqual(empty.error, 'Empty expression');

    console.log('✅ PASS: Comprehensive error handling (div by 0, domain errors, syntax errors)');
  }

  // 7. Result Formatting
  {
    assert.strictEqual(formatResultNumber(0), '0');
    assert.strictEqual(formatResultNumber(123.456), '123.456');
    assert.strictEqual(formatResultNumber(1e14), '1e+14');

    console.log('✅ PASS: Result formatting');
  }
}
