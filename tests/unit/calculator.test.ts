import {
  add,
  subtract,
  multiply,
  divide,
  modulo,
  power,
  squareRoot,
  factorial,
  sinDegrees,
  cosDegrees,
  tanDegrees,
  log10,
  ln,
  evaluateExpression,
  CalculatorEngine,
  CalculatorError,
} from '../../src/utils/calculator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCalculatorUnitTests() {
  console.log('\n--- [Unit Test] Calculator Engine & Expression Parser ---');

  // 1. Basic Arithmetic
  assert(add(10, 5) === 15, '10 + 5 should equal 15');
  assert(subtract(20, 8) === 12, '20 - 8 should equal 12');
  assert(multiply(4, 7) === 28, '4 * 7 should equal 28');
  assert(divide(100, 4) === 25, '100 / 4 should equal 25');
  assert(modulo(17, 5) === 2, '17 % 5 should equal 2');

  try {
    divide(10, 0);
    assert(false, 'Divide by zero should throw error');
  } catch (err: any) {
    assert(err instanceof CalculatorError, 'Should throw CalculatorError on divide by zero');
  }

  console.log('✅ PASS: Basic arithmetic operations verified');

  // 2. Scientific Functions
  assert(power(2, 8) === 256, '2^8 should equal 256');
  assert(squareRoot(144) === 12, 'sqrt(144) should equal 12');
  assert(factorial(5) === 120, '5! should equal 120');
  assert(factorial(0) === 1, '0! should equal 1');
  assert(sinDegrees(0) === 0, 'sin(0°) should equal 0');
  assert(sinDegrees(90) === 1, 'sin(90°) should equal 1');
  assert(cosDegrees(0) === 1, 'cos(0°) should equal 1');
  assert(log10(100) === 2, 'log10(100) should equal 2');
  assert(Math.abs(ln(Math.E) - 1) < 1e-10, 'ln(e) should equal 1');

  try {
    squareRoot(-9);
    assert(false, 'sqrt of negative should throw error');
  } catch (err: any) {
    assert(err instanceof CalculatorError, 'Should throw error for negative sqrt');
  }

  try {
    factorial(-5);
    assert(false, 'factorial of negative should throw error');
  } catch (err: any) {
    assert(err instanceof CalculatorError, 'Should throw error for negative factorial');
  }

  console.log('✅ PASS: Scientific operations verified');

  // 3. Expression Evaluation
  assert(evaluateExpression('2 + 3 * 4') === 14, '2 + 3 * 4 = 14');
  assert(evaluateExpression('(2 + 3) * 4') === 20, '(2 + 3) * 4 = 20');
  assert(evaluateExpression('10 + 2^3 - 5') === 13, '10 + 2^3 - 5 = 13');
  assert(evaluateExpression('sqrt(16) + 5') === 9, 'sqrt(16) + 5 = 9');
  assert(evaluateExpression('sin(90) * 10') === 10, 'sin(90) * 10 = 10');
  assert(evaluateExpression('-5 + 12') === 7, '-5 + 12 = 7');
  assert(evaluateExpression('5!') === 120, '5! = 120');
  assert(Math.abs(evaluateExpression('pi') - Math.PI) < 1e-10, 'pi constant = Math.PI');

  try {
    evaluateExpression('2 + (3 * 4');
    assert(false, 'Mismatched parentheses should throw error');
  } catch (err: any) {
    assert(err instanceof CalculatorError, 'Should catch mismatched parentheses');
  }

  console.log('✅ PASS: Expression evaluation & precedence verified');

  // 4. CalculatorEngine Memory & History
  const engine = new CalculatorEngine();
  assert(engine.getMemory() === 0, 'Initial memory should be 0');

  engine.memoryAdd(50);
  assert(engine.getMemory() === 50, 'Memory should be 50 after M+');

  engine.memorySubtract(20);
  assert(engine.getMemory() === 30, 'Memory should be 30 after M-');

  assert(engine.memoryRecall() === 30, 'MR should return 30');

  engine.memoryClear();
  assert(engine.getMemory() === 0, 'MC should reset memory to 0');

  const res1 = engine.calculate('10 + 20');
  assert(res1 === 30, 'calculate(10+20) = 30');

  const res2 = engine.calculate('sqrt(100)');
  assert(res2 === 10, 'calculate(sqrt(100)) = 10');

  const hist = engine.getHistory();
  assert(hist.length === 2, 'History should contain 2 items');
  assert(hist[0].expression === 'sqrt(100)', 'Most recent history item matched');
  assert(hist[0].result === 10, 'Most recent result matched');

  engine.clearHistory();
  assert(engine.getHistory().length === 0, 'clearHistory should wipe history log');

  console.log('✅ PASS: CalculatorEngine memory & history verified');
}
