import assert from 'node:assert';
import { CalculatorEngine } from '../../src/utils/calculatorEngine';
import { routeManager } from '../../src/managers/routeManager';

export async function runCalculatorUnitTests() {
  console.log('\n--- [Unit Test] Calculator Engine & Route Navigation ---');

  // Test 1: Basic Arithmetic Operations
  const engine = new CalculatorEngine();

  // 12 + 8 = 20
  engine.inputDigit('1');
  engine.inputDigit('2');
  engine.performOperation('+');
  engine.inputDigit('8');
  engine.equals();
  assert.strictEqual(engine.getState().displayValue, '20');
  assert.strictEqual(engine.getState().expression, '12 + 8 =');
  console.log('✅ PASS: Basic addition (12 + 8 = 20)');

  // 20 - 5 = 15
  engine.performOperation('-');
  engine.inputDigit('5');
  engine.equals();
  assert.strictEqual(engine.getState().displayValue, '15');
  console.log('✅ PASS: Chained subtraction (20 - 5 = 15)');

  // 15 * 3 = 45
  engine.performOperation('*');
  engine.inputDigit('3');
  engine.equals();
  assert.strictEqual(engine.getState().displayValue, '45');
  console.log('✅ PASS: Chained multiplication (15 * 3 = 45)');

  // 45 / 9 = 5
  engine.performOperation('/');
  engine.inputDigit('9');
  engine.equals();
  assert.strictEqual(engine.getState().displayValue, '5');
  console.log('✅ PASS: Chained division (45 / 9 = 5)');

  // Test 2: Decimals & Floating Point Precision
  engine.clearAll();
  engine.inputDigit('0');
  engine.inputDecimal();
  engine.inputDigit('1');
  engine.performOperation('+');
  engine.inputDigit('0');
  engine.inputDecimal();
  engine.inputDigit('2');
  engine.equals();
  assert.strictEqual(engine.getState().displayValue, '0.3');
  console.log('✅ PASS: Floating point precision handling (0.1 + 0.2 = 0.3)');

  // Test 3: Division by zero error handling
  engine.clearAll();
  engine.inputDigit('1');
  engine.inputDigit('0');
  engine.performOperation('/');
  engine.inputDigit('0');
  engine.equals();
  assert.strictEqual(engine.getState().isError, true);
  assert.strictEqual(engine.getState().displayValue, 'Erreur');
  assert.strictEqual(engine.getState().errorMessage, 'Division par zéro');
  console.log('✅ PASS: Division by zero handled gracefully with error state');

  // Recovering from error on new input
  engine.inputDigit('5');
  assert.strictEqual(engine.getState().isError, false);
  assert.strictEqual(engine.getState().displayValue, '5');
  console.log('✅ PASS: Automatic error recovery on new input');

  // Test 4: Extended Functions (Square, Square Root, Percentage, Sign Toggle, Backspace)
  engine.clearAll();
  engine.inputDigit('9');
  engine.square();
  assert.strictEqual(engine.getState().displayValue, '81');
  console.log('✅ PASS: Square function (9² = 81)');

  engine.squareRoot();
  assert.strictEqual(engine.getState().displayValue, '9');
  console.log('✅ PASS: Square root function (√81 = 9)');

  engine.toggleSign();
  assert.strictEqual(engine.getState().displayValue, '-9');
  console.log('✅ PASS: Toggle sign (-9)');

  engine.squareRoot();
  assert.strictEqual(engine.getState().isError, true);
  console.log('✅ PASS: Negative square root error check');

  // Backspace
  engine.clearAll();
  engine.inputDigit('1');
  engine.inputDigit('2');
  engine.inputDigit('3');
  engine.backspace();
  assert.strictEqual(engine.getState().displayValue, '12');
  engine.backspace();
  assert.strictEqual(engine.getState().displayValue, '1');
  engine.backspace();
  assert.strictEqual(engine.getState().displayValue, '0');
  console.log('✅ PASS: Backspace behavior');

  // Test 5: Memory Operations (MC, MR, M+, M-)
  engine.clearAll();
  engine.inputDigit('5');
  engine.memoryAdd(); // M = 5
  assert.strictEqual(engine.getState().memory, 5);

  engine.inputDigit('3');
  engine.memoryAdd(); // M = 8
  assert.strictEqual(engine.getState().memory, 8);

  engine.inputDigit('2');
  engine.memorySubtract(); // M = 6
  assert.strictEqual(engine.getState().memory, 6);

  engine.clearEntry();
  engine.memoryRecall();
  assert.strictEqual(engine.getState().displayValue, '6');

  engine.memoryClear();
  assert.strictEqual(engine.getState().memory, 0);
  console.log('✅ PASS: Memory operations (M+, M-, MR, MC)');

  // Test 6: History Tracking & Loading Item
  engine.clearAll();
  engine.inputDigit('7');
  engine.performOperation('*');
  engine.inputDigit('6');
  engine.equals(); // 7 * 6 = 42

  const history = engine.getState().history;
  assert.ok(history.length >= 1);
  assert.strictEqual(history[0].result, '42');

  engine.clear();
  engine.loadHistoryItem(history[0]);
  assert.strictEqual(engine.getState().displayValue, '42');
  console.log('✅ PASS: History logging and item re-loading');

  // Test 7: Navigation & Route Manager Integration
  routeManager.navigate('calculator');
  const routeState = routeManager.getState();
  assert.strictEqual(routeState.currentRoute, 'calculator');
  assert.strictEqual(routeState.primaryPage, 'calculator');
  console.log('✅ PASS: RouteManager supports calculator primary page route');
}
