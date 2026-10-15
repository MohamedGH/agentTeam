import assert from 'node:assert';
import {
  INITIAL_CALCULATOR_STATE,
  inputDigit,
  inputDecimal,
  toggleSign,
  applyPercentage,
  handleOperator,
  performEquals,
  backspace,
  clearAll,
  memoryClear,
  memoryRecall,
  memoryAdd,
  memorySubtract,
  clearHistory,
  formatCalculatorNumber,
  evaluateOperation,
} from '../../src/utils/calculatorLogic';

export async function runCalculatorUnitTests() {
  console.log('\n--- [Unit Test] Web Calculator Core Logic ---');

  // Test 1: Basic Arithmetic Operations
  const addRes = evaluateOperation(5, 3, '+');
  assert.strictEqual(addRes.result, 8, '5 + 3 should equal 8');

  const subRes = evaluateOperation(10, 4, '-');
  assert.strictEqual(subRes.result, 6, '10 - 4 should equal 6');

  const mulRes = evaluateOperation(6, 7, '*');
  assert.strictEqual(mulRes.result, 42, '6 * 7 should equal 42');

  const divRes = evaluateOperation(20, 5, '/');
  assert.strictEqual(divRes.result, 4, '20 / 5 should equal 4');

  const divZeroRes = evaluateOperation(10, 0, '/');
  assert.ok(divZeroRes.error, 'Division by zero should return an error message');
  assert.strictEqual(divZeroRes.error, 'Cannot divide by zero');
  console.log('✅ PASS: Basic arithmetic & zero-division handling verified');

  // Test 2: Precision Formatting
  assert.strictEqual(formatCalculatorNumber(0.1 + 0.2), '0.3', 'Floating point sum 0.1 + 0.2 should format to 0.3');
  assert.strictEqual(formatCalculatorNumber(100000000000000), '1e+14', 'Large numbers should be formatted in exponential notation');
  console.log('✅ PASS: Floating point precision formatting verified');

  // Test 3: Sequential Digit Input & Decimal
  let s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '1');
  s = inputDigit(s, '2');
  assert.strictEqual(s.displayValue, '12');

  s = inputDecimal(s);
  s = inputDigit(s, '5');
  assert.strictEqual(s.displayValue, '12.5');

  // Second decimal input should be ignored
  s = inputDecimal(s);
  assert.strictEqual(s.displayValue, '12.5');
  console.log('✅ PASS: Digit input and decimal point handling verified');

  // Test 4: Chained Operations & History
  s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '1');
  s = inputDigit(s, '0'); // '10'
  s = handleOperator(s, '+'); // prev=10, op='+'
  s = inputDigit(s, '5'); // '5'
  s = performEquals(s); // 15
  assert.strictEqual(s.displayValue, '15');
  assert.strictEqual(s.history.length, 1);
  assert.strictEqual(s.history[0].expression, '10 + 5');
  assert.strictEqual(s.history[0].result, '15');

  // Chain another operation on result
  s = handleOperator(s, '*'); // prev=15, op='*'
  s = inputDigit(s, '2');
  s = performEquals(s); // 30
  assert.strictEqual(s.displayValue, '30');
  assert.strictEqual(s.history.length, 2);
  assert.strictEqual(s.history[0].expression, '15 × 2');
  assert.strictEqual(s.history[0].result, '30');
  console.log('✅ PASS: Chained calculations and history stack verified');

  // Test 5: Backspace and Toggle Sign
  s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '9');
  s = inputDigit(s, '8');
  s = backspace(s);
  assert.strictEqual(s.displayValue, '9');

  s = toggleSign(s);
  assert.strictEqual(s.displayValue, '-9');
  s = toggleSign(s);
  assert.strictEqual(s.displayValue, '9');
  console.log('✅ PASS: Backspace and sign toggling verified');

  // Test 6: Percentage
  s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '5');
  s = inputDigit(s, '0');
  s = applyPercentage(s); // 50% = 0.5
  assert.strictEqual(s.displayValue, '0.5');
  console.log('✅ PASS: Percentage calculation verified');

  // Test 7: Memory Functions (M+, M-, MR, MC)
  s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '1');
  s = inputDigit(s, '0');
  s = inputDigit(s, '0');
  s = memoryAdd(s); // M = 100
  assert.strictEqual(s.memory, 100);

  s = clearAll(s);
  s = inputDigit(s, '2');
  s = inputDigit(s, '5');
  s = memorySubtract(s); // M = 75
  assert.strictEqual(s.memory, 75);

  s = clearAll(s);
  s = memoryRecall(s);
  assert.strictEqual(s.displayValue, '75');

  s = memoryClear(s);
  assert.strictEqual(s.memory, 0);
  console.log('✅ PASS: Memory operations (M+, M-, MR, MC) verified');

  // Test 8: Division by Zero Error Handling & Clear
  s = INITIAL_CALCULATOR_STATE;
  s = inputDigit(s, '8');
  s = handleOperator(s, '/');
  s = inputDigit(s, '0');
  s = performEquals(s);
  assert.strictEqual(s.hasError, true);
  assert.strictEqual(s.displayValue, 'Error');

  // Typing new digits after error should reset error state cleanly
  s = inputDigit(s, '4');
  assert.strictEqual(s.hasError, false);
  assert.strictEqual(s.displayValue, '4');
  console.log('✅ PASS: Division by zero error state & clear recovery verified');

  // Test 9: Clear History
  s = clearHistory(s);
  assert.strictEqual(s.history.length, 0);
  console.log('✅ PASS: Clear history verified');

  console.log('✅ All Web Calculator Unit Tests Passed Successfully!');
}
