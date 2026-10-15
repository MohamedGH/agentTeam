import {
  INITIAL_CALCULATOR_STATE,
  inputDigit,
  inputDecimal,
  clearAll,
  clearEntry,
  backspace,
  toggleSign,
  inputPercent,
  performOperation,
  calculateEquals,
  memoryClear,
  memoryRecall,
  memoryAdd,
  memorySubtract,
  formatResultNumber,
} from '../../src/utils/calculator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runCalculatorUnitTests() {
  console.log('--- [Unit Test] Calculator Engine ---');

  // Test 1: Digit input & Decimal
  let state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '1');
  state = inputDigit(state, '2');
  assert(state.displayValue === '12', `Expected display '12', got '${state.displayValue}'`);

  state = inputDecimal(state);
  state = inputDigit(state, '5');
  assert(state.displayValue === '12.5', `Expected display '12.5', got '${state.displayValue}'`);

  // Prevent multiple decimal points
  state = inputDecimal(state);
  assert(state.displayValue === '12.5', `Expected display '12.5', got '${state.displayValue}'`);
  console.log('✅ PASS: Digit input and decimal point handling');

  // Test 2: Basic Addition
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '7');
  state = performOperation(state, '+');
  assert(state.displayValue === '7', `Expected display '7', got '${state.displayValue}'`);
  assert(state.waitingForOperand === true, 'Expected waitingForOperand to be true');

  state = inputDigit(state, '8');
  state = calculateEquals(state);
  assert(state.displayValue === '15', `Expected display '15', got '${state.displayValue}'`);
  assert(state.history.length === 1, 'Expected history length 1');
  assert(state.history[0].expression === '7 + 8 =', `Expected '7 + 8 =', got '${state.history[0].expression}'`);
  console.log('✅ PASS: Basic addition and history recording');

  // Test 3: Subtraction & Multiplication & Precision formatting
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '0');
  state = inputDecimal(state);
  state = inputDigit(state, '1'); // 0.1
  state = performOperation(state, '+');
  state = inputDigit(state, '0');
  state = inputDecimal(state);
  state = inputDigit(state, '2'); // 0.2
  state = calculateEquals(state);
  assert(state.displayValue === '0.3', `Expected display '0.3', got '${state.displayValue}'`);
  console.log('✅ PASS: Float precision handling (0.1 + 0.2 = 0.3)');

  // Test 4: Division by zero
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '9');
  state = performOperation(state, '/');
  state = inputDigit(state, '0');
  state = calculateEquals(state);
  assert(state.isError === true, 'Expected error state on division by zero');
  assert(state.displayValue.includes('Division par zéro'), `Expected error message, got '${state.displayValue}'`);

  // Recovery from error state
  state = inputDigit(state, '5');
  assert(state.isError === false, 'Expected error state to be cleared after digit input');
  assert(state.displayValue === '5', `Expected display '5', got '${state.displayValue}'`);
  console.log('✅ PASS: Division by zero error handling & recovery');

  // Test 5: Backspace & Sign Toggle
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '4');
  state = inputDigit(state, '2');
  state = toggleSign(state);
  assert(state.displayValue === '-42', `Expected display '-42', got '${state.displayValue}'`);

  state = backspace(state);
  assert(state.displayValue === '-4', `Expected display '-4', got '${state.displayValue}'`);
  state = backspace(state);
  assert(state.displayValue === '0', `Expected display '0', got '${state.displayValue}'`);
  console.log('✅ PASS: Sign toggle & backspace');

  // Test 6: Memory operations
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '5');
  state = inputDigit(state, '0'); // 50
  state = memoryAdd(state); // M = 50
  assert(state.memory === 50, `Expected memory 50, got ${state.memory}`);

  state = clearAll(state);
  assert(state.displayValue === '0', 'Expected display reset');
  assert(state.memory === 50, 'Memory should persist clearAll');

  state = inputDigit(state, '2');
  state = inputDigit(state, '0'); // 20
  state = memorySubtract(state); // M = 30
  assert(state.memory === 30, `Expected memory 30, got ${state.memory}`);

  state = memoryRecall(state);
  assert(state.displayValue === '30', `Expected recall display '30', got '${state.displayValue}'`);

  state = memoryClear(state);
  assert(state.memory === 0, 'Memory should be 0 after clear');
  console.log('✅ PASS: Memory operations (M+, M-, MR, MC)');

  // Test 7: Percentage calculation
  state = INITIAL_CALCULATOR_STATE;
  state = inputDigit(state, '2');
  state = inputDigit(state, '0');
  state = inputDigit(state, '0'); // 200
  state = performOperation(state, '+');
  state = inputDigit(state, '1');
  state = inputDigit(state, '5'); // 15
  state = inputPercent(state); // 15% of 200 = 30
  assert(state.displayValue === '30', `Expected percentage display '30', got '${state.displayValue}'`);

  state = calculateEquals(state);
  assert(state.displayValue === '230', `Expected total 230, got '${state.displayValue}'`);
  console.log('✅ PASS: Percentage calculation');

  console.log('✅ Calculator Engine Unit Tests Passed\n');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('calculator.test')) {
  runCalculatorUnitTests();
}
