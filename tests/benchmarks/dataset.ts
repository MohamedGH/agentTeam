import { BenchmarkDefinition } from '../../server/llm/types';

/**
 * Standardized Benchmark Reference Dataset
 * 
 * Covering all required categories:
 * - debugging (CODE_DEBUGGING)
 * - code generation (CODE_GENERATION)
 * - refactoring (REFACTORING)
 * - testing (TEST_GENERATION)
 * - security (SECURITY)
 * - architecture (ARCHITECTURE)
 * - reasoning (REASONING)
 * - mathematics (MATHEMATICS)
 */
export const BENCHMARK_DATASET: BenchmarkDefinition[] = [
  // 1. CODE_DEBUGGING
  {
    id: 'bench_debug_off_by_one_binary_search',
    name: 'Binary Search Off-by-One and Overflow Bug',
    category: 'CODE_DEBUGGING',
    subcategory: 'boundary_condition',
    difficulty: 'MEDIUM',
    prompt: `Fix the following buggy TypeScript binary search implementation.
\`\`\`typescript
function binarySearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length; // BUG: off by one
  while (low <= high) {
    let mid = Math.floor((low + high) / 2); // BUG: potential overflow on large int
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) low = mid; // BUG: infinite loop
    else high = mid;
  }
  return -1;
}
\`\`\`
Return the corrected function. Ensure target not found returns -1, and all indices are within bounds.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Correctly finds targets at start, middle, end, not found, empty array without infinite loop',
      testCode: `
        const fn = new Function('arr', 'target', \`
          \${code}
          return binarySearch(arr, target);
        \`);
        const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
        if (fn(arr, 23) !== 5) throw new Error('Failed to find middle element 23 at index 5');
        if (fn(arr, 2) !== 0) throw new Error('Failed to find first element 2 at index 0');
        if (fn(arr, 91) !== 9) throw new Error('Failed to find last element 91 at index 9');
        if (fn(arr, 100) !== -1) throw new Error('Failed on element greater than all');
        if (fn(arr, 1) !== -1) throw new Error('Failed on element smaller than all');
        if (fn([], 10) !== -1) throw new Error('Failed on empty array');
      `,
      forbiddenPatterns: ['while (low <= high) { let mid = Math.floor((low + high) / 2); if (arr[mid] < target) low = mid;'],
      requiredPatterns: ['mid + 1', 'mid - 1'],
    },
  },

  // 2. CODE_GENERATION
  {
    id: 'bench_codegen_lru_cache',
    name: 'Bounded LRU Cache with O(1) Operations',
    category: 'CODE_GENERATION',
    subcategory: 'data_structure',
    difficulty: 'HIGH',
    prompt: `Implement a typed LRU Cache in TypeScript with capacity limit.
Must provide:
- \`get(key: string): any\` in O(1)
- \`put(key: string, value: any): void\` in O(1)
When capacity is exceeded, evict the least recently used entry.
Export class LRUCache.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Maintains capacity, updates recency on get/put, evicts LRU item',
      testCode: `
        const factory = new Function(\`
          \${code}
          return LRUCache;
        \`);
        const LRUCache = factory();
        const cache = new LRUCache(2);
        cache.put('a', 1);
        cache.put('b', 2);
        if (cache.get('a') !== 1) throw new Error('Expected key a to return 1');
        cache.put('c', 3); // evicts b, as a was recently accessed
        if (cache.get('b') !== undefined && cache.get('b') !== null && cache.get('b') !== -1) {
          throw new Error('Key b should have been evicted');
        }
        if (cache.get('c') !== 3) throw new Error('Expected key c to return 3');
        if (cache.get('a') !== 1) throw new Error('Expected key a to still be present');
      `,
      requiredPatterns: ['class LRUCache', 'get', 'put'],
    },
  },

  // 3. REFACTORING
  {
    id: 'bench_refactor_callback_hell_to_async_await',
    name: 'Callback Hell to Safe Async/Await Transformation',
    category: 'REFACTORING',
    subcategory: 'async_modernization',
    difficulty: 'MEDIUM',
    prompt: `Refactor the following nested callback function into modern, clean async/await with typed errors:
\`\`\`typescript
function fetchUserDashboard(userId, cb) {
  getUser(userId, (err, user) => {
    if (err) return cb(err);
    getPreferences(user.id, (err2, prefs) => {
      if (err2) return cb(err2);
      getNotifications(user.id, (err3, notifs) => {
        if (err3) return cb(err3);
        cb(null, { user, prefs, notifs });
      });
    });
  });
}
\`\`\`
Return \`async function fetchUserDashboard(userId: string): Promise<UserDashboard>\`.
Execute independent operations in parallel where possible.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Uses async/await, avoids nested callbacks, uses Promise.all for independent requests',
      requiredPatterns: ['async function fetchUserDashboard', 'Promise.all', 'await'],
      forbiddenPatterns: ['getUser(userId, (err', 'getPreferences(user.id, (err2'],
    },
  },

  // 4. TEST_GENERATION
  {
    id: 'bench_testing_string_calculator_tdd',
    name: 'Comprehensive Unit Test Suite for Delimited String Calculator',
    category: 'TEST_GENERATION',
    subcategory: 'unit_testing',
    difficulty: 'MEDIUM',
    prompt: `Write a robust test suite for a String Calculator function \`add(numbers: string): number\`.
Requirements:
1. Empty string returns 0
2. Single number returns that number
3. Two numbers comma separated returns sum
4. Newlines between numbers allowed ("1\\n2,3" = 6)
5. Custom delimiters format "//[delimiter]\\n[numbers...]" e.g. "//;\\n1;2" = 3
6. Negative numbers throw an error with message listing all negative numbers.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Generates comprehensive test assertions covering all 6 cases including negative number rejection',
      requiredPatterns: ['describe', 'it(', 'expect', 'negative', 'delimiter', '\\n'],
    },
  },

  // 5. SECURITY
  {
    id: 'bench_security_path_traversal_remediation',
    name: 'Prevent Path Traversal and Command Injection in File Serving Handler',
    category: 'SECURITY',
    subcategory: 'path_traversal_remediation',
    difficulty: 'HIGH',
    prompt: `Review and secure the following vulnerable file serving handler:
\`\`\`typescript
app.get('/files', (req, res) => {
  const filePath = path.join(BASE_DIR, req.query.filename);
  res.sendFile(filePath);
});
\`\`\`
Implement defense in depth:
1. Reject any path traversal (../ or decoded URI variants)
2. Resolve absolute path and verify it starts with safe BASE_DIR
3. Prevent null byte injection and invalid characters
4. Return 403/400 if unsafe.`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Validates resolved path against root directory, sanitizes URI encoding, blocks null bytes',
      requiredPatterns: ['path.resolve', 'startsWith', '403', '..'],
      forbiddenPatterns: ['res.sendFile(filePath)'], // directly without validation
    },
  },

  // 6. ARCHITECTURE
  {
    id: 'bench_architecture_event_driven_pipeline',
    name: 'Hexagonal Architecture Port & Adapter Design',
    category: 'ARCHITECTURE',
    subcategory: 'system_design',
    difficulty: 'HIGH',
    prompt: `Design a Hexagonal Architecture (Ports and Adapters) for an Order Processing System in TypeScript.
Define:
- Core Domain Entities & Business Rules (Order, OrderStatus)
- Inbound Port (IOrderService)
- Outbound Port (IOrderRepository, IPaymentGateway, IEventPublisher)
- Primary & Secondary Adapter interfaces
Ensure zero dependency from Core Domain to external frameworks.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Defines distinct Domain, Ports, Adapters layers with inverted dependencies',
      requiredPatterns: ['interface IOrderRepository', 'interface IPaymentGateway', 'interface IOrderService', 'OrderStatus', 'class Order'],
    },
  },

  // 7. REASONING
  {
    id: 'bench_reasoning_scheduling_graph',
    name: 'Job Dependency Scheduling and Cycle Detection',
    category: 'REASONING',
    subcategory: 'topological_sort',
    difficulty: 'HIGH',
    prompt: `Given a directed dependency graph of jobs:
A depends on B, C
B depends on D
C depends on D
D depends on nothing
E depends on A

1. Can all jobs be executed? If so, what is a valid execution order?
2. If we add a dependency from D to E, what happens? Provide formal cycle explanation.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Recognizes valid topological order (D first, then B and C, then A, then E) and explains cycle deadlock',
      requiredPatterns: ['D', 'B', 'C', 'A', 'E', 'cycle', 'deadlock'],
    },
  },

  // 8. MATHEMATICS
  {
    id: 'bench_math_matrix_multiplication_determinant',
    name: 'Determinant of 3x3 Matrix and Eigenvalues Property',
    category: 'MATHEMATICS',
    subcategory: 'linear_algebra',
    difficulty: 'MEDIUM',
    prompt: `Calculate the determinant of matrix M:
M = [
 [2, 1, 3],
 [0, 4, 1],
 [5, 2, 0]
]
Show step by step calculation using cofactor expansion along the first column.
State the exact final integer determinant.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Correctly computes determinant: 2*(0-2) - 0 + 5*(1-12) = 2*(-2) + 5*(-11) = -4 - 55 = -59',
      requiredPatterns: ['-59'],
    },
  },
];
