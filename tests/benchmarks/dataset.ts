import { BenchmarkDefinition } from '../../server/llm/types';

/**
 * Standardized Benchmark Reference Dataset
 * 
 * Strict empirical coverage across 8 core categories:
 * - CODE_DEBUGGING (>= 5 benchmarks)
 * - CODE_GENERATION (>= 5 benchmarks)
 * - REFACTORING (>= 5 benchmarks)
 * - TEST_GENERATION (>= 5 benchmarks)
 * - SECURITY (>= 5 benchmarks)
 * - ARCHITECTURE (>= 5 benchmarks)
 * - REASONING (>= 5 benchmarks)
 * - MATHEMATICS (>= 5 benchmarks)
 * 
 * Covering varied difficulty strata: LOW, MEDIUM, HIGH, EXTREME.
 */
export const BENCHMARK_DATASET: BenchmarkDefinition[] = [
  // =========================================================================
  // 1. CODE_DEBUGGING (6 benchmarks)
  // =========================================================================
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
  let high = arr.length;
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) low = mid;
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
        const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
        assert(binarySearch(arr, 23) === 5, 'Find middle element');
        assert(binarySearch(arr, 2) === 0, 'Find first element');
        assert(binarySearch(arr, 91) === 9, 'Find last element');
        assert(binarySearch(arr, 100) === -1, 'Greater than all');
        assert(binarySearch(arr, 1) === -1, 'Smaller than all');
        assert(binarySearch([], 10) === -1, 'Empty array');
      `,
      forbiddenPatterns: ['low = mid;'],
      requiredPatterns: ['mid + 1', 'mid - 1'],
    },
  },
  {
    id: 'bench_debug_async_race_condition_mutex',
    name: 'Async State Mutation Race Condition',
    category: 'CODE_DEBUGGING',
    subcategory: 'concurrency',
    difficulty: 'HIGH',
    prompt: `Fix race condition in bank account transfer method that allows double withdrawals when called concurrently.
\`\`\`typescript
class Account {
  private balance: number;
  constructor(balance: number) { this.balance = balance; }
  async withdraw(amount: number): Promise<boolean> {
    const current = await this.getBalance();
    if (current >= amount) {
      await delay(10);
      this.balance = current - amount;
      return true;
    }
    return false;
  }
  async getBalance(): Promise<number> { return this.balance; }
}
\`\`\`
Return the corrected Account class with atomic/serialized execution or mutex protection.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Prevents double spend during concurrent withdraw calls',
      testCode: `
        const acc = new Account(100);
        const results = await Promise.all([acc.withdraw(80), acc.withdraw(80)]);
        const successCount = results.filter(r => r === true).length;
        assert(successCount === 1, 'Only one withdrawal of 80 must succeed on 100 balance');
        const finalBal = await acc.getBalance();
        assert(finalBal === 20, 'Final balance must be exactly 20');
      `,
      requiredPatterns: ['class Account', 'withdraw'],
    },
  },
  {
    id: 'bench_debug_recursive_tree_stack_overflow',
    name: 'Deep Tree Traversal Stack Overflow',
    category: 'CODE_DEBUGGING',
    subcategory: 'recursion_to_iteration',
    difficulty: 'LOW',
    prompt: `Fix the recursive sumTree function that crashes with Maximum call stack size exceeded on deeply skewed trees.
\`\`\`typescript
interface TreeNode { val: number; next?: TreeNode; }
function sumTree(root?: TreeNode): number {
  if (!root) return 0;
  return root.val + sumTree(root.next);
}
\`\`\`
Rewrite to an iterative loop that handles 100,000 nodes without stack overflow.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Iterative tree sum handles large depth without stack overflow',
      testCode: `
        let head = { val: 1 };
        let curr = head;
        for (let i = 2; i <= 20000; i++) {
          curr.next = { val: 1 };
          curr = curr.next;
        }
        assert(sumTree(head) === 20000, 'Sum of 20,000 nodes equals 20,000');
        assert(sumTree(undefined) === 0, 'Empty tree returns 0');
      `,
      requiredPatterns: ['while', 'sumTree'],
    },
  },
  {
    id: 'bench_debug_floating_point_currency',
    name: 'Floating Point Precision Inaccuracy in Pricing',
    category: 'CODE_DEBUGGING',
    subcategory: 'floating_point',
    difficulty: 'LOW',
    prompt: `Fix floating point inaccuracy in shopping cart calculation.
\`\`\`typescript
function calculateTotal(items: { price: number; quantity: number }[]): number {
  return items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}
\`\`\`
For items [{price: 0.1, quantity: 1}, {price: 0.2, quantity: 1}], 0.1 + 0.2 produces 0.30000000000000004.
Return an integer cents or rounded 2-decimal currency number.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Produces exact currency arithmetic without floating point drift',
      testCode: `
        const items = [{ price: 0.1, quantity: 1 }, { price: 0.2, quantity: 1 }];
        assert(calculateTotal(items) === 0.30, '0.1 + 0.2 must equal 0.30 exactly');
        const items2 = [{ price: 19.99, quantity: 3 }];
        assert(calculateTotal(items2) === 59.97, '19.99 * 3 must equal 59.97');
      `,
      requiredPatterns: ['calculateTotal'],
    },
  },
  {
    id: 'bench_debug_memory_leak_event_listener',
    name: 'Node Event Emitter Memory Leak in Long-Lived Service',
    category: 'CODE_DEBUGGING',
    subcategory: 'memory_management',
    difficulty: 'HIGH',
    prompt: `Fix memory leak in subscriber subscription tracker where listeners accumulate without cleanup.
\`\`\`typescript
class StreamWatcher {
  private emitter: any;
  constructor(emitter: any) { this.emitter = emitter; }
  watch(topic: string, handler: (data: any) => void) {
    this.emitter.on(topic, handler);
  }
}
\`\`\`
Provide a subscribe method that returns an unbind/dispose function and ensures removeListener is properly invoked.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Returns cleanup function that detaches event listener',
      testCode: `
        let listenerCount = 0;
        const fakeEmitter = {
          on: () => { listenerCount++; },
          removeListener: () => { listenerCount--; },
          off: () => { listenerCount--; }
        };
        const watcher = new StreamWatcher(fakeEmitter);
        const unsubscribe = watcher.watch('data', () => {});
        assert(listenerCount === 1, 'Listener attached');
        if (typeof unsubscribe === 'function') unsubscribe();
        else if (typeof watcher.unwatch === 'function') watcher.unwatch();
        assert(listenerCount === 0, 'Listener successfully removed upon cleanup');
      `,
      requiredPatterns: ['class StreamWatcher'],
    },
  },
  {
    id: 'bench_debug_sql_transaction_deadlock',
    name: 'Ordered Resource Acquisition Deadlock Prevention',
    category: 'CODE_DEBUGGING',
    subcategory: 'deadlock_prevention',
    difficulty: 'EXTREME',
    prompt: `Fix the deadlock vulnerability in multi-account transfer when transfers happen simultaneously in reverse directions (A->B vs B->A).
\`\`\`typescript
async function transfer(fromId: string, toId: string, amount: number, db: any) {
  await db.lockAccount(fromId);
  await db.lockAccount(toId);
  await db.updateBalances(fromId, toId, amount);
  await db.unlockAccount(toId);
  await db.unlockAccount(fromId);
}
\`\`\`
Ensure lock ordering is globally deterministic (e.g. sorted by ID) to eliminate cyclical lock wait.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Sorts account IDs before acquiring locks to guarantee global hierarchy',
      requiredPatterns: ['sort', 'transfer', 'lockAccount'],
    },
  },

  // =========================================================================
  // 2. CODE_GENERATION (6 benchmarks)
  // =========================================================================
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
        const cache = new LRUCache(2);
        cache.put('a', 1);
        cache.put('b', 2);
        assert(cache.get('a') === 1, 'Expected key a to return 1');
        cache.put('c', 3); // evicts b, as a was accessed
        assert(cache.get('b') === undefined || cache.get('b') === null, 'b was evicted');
        assert(cache.get('c') === 3, 'c is present');
        assert(cache.get('a') === 1, 'a is still present');
      `,
      requiredPatterns: ['class LRUCache', 'get', 'put'],
    },
  },
  {
    id: 'bench_codegen_rate_limiter_token_bucket',
    name: 'Token Bucket Rate Limiter Algorithm',
    category: 'CODE_GENERATION',
    subcategory: 'rate_limiting',
    difficulty: 'MEDIUM',
    prompt: `Implement a TokenBucketRateLimiter class in TypeScript.
Constructor accepts \`(capacity: number, refillRatePerSecond: number)\`.
Method \`tryConsume(tokens = 1): boolean\` returns true if tokens were available and consumed, false otherwise.
Refills tokens continuously based on elapsed time up to capacity.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Allows burst up to capacity, refills smoothly over time',
      testCode: `
        const limiter = new TokenBucketRateLimiter(5, 10); // 5 max, 10 per sec
        assert(limiter.tryConsume(3) === true, 'Consumes 3 out of 5');
        assert(limiter.tryConsume(2) === true, 'Consumes remaining 2');
        assert(limiter.tryConsume(1) === false, 'Cannot consume when bucket is empty');
      `,
      requiredPatterns: ['class TokenBucketRateLimiter', 'tryConsume'],
    },
  },
  {
    id: 'bench_codegen_trie_prefix_tree',
    name: 'Prefix Tree (Trie) with Autocomplete Search',
    category: 'CODE_GENERATION',
    subcategory: 'string_algorithms',
    difficulty: 'MEDIUM',
    prompt: `Implement a Trie class with:
- \`insert(word: string): void\`
- \`search(word: string): boolean\`
- \`startsWith(prefix: string): string[]\` (returns all words starting with prefix).`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Inserts and finds exact words and autocomplete prefixes',
      testCode: `
        const trie = new Trie();
        trie.insert('apple');
        trie.insert('app');
        trie.insert('apricot');
        trie.insert('banana');
        assert(trie.search('apple') === true, 'Find apple');
        assert(trie.search('app') === true, 'Find app');
        assert(trie.search('appl') === false, 'appl not inserted');
        const matches = trie.startsWith('ap');
        assert(matches.includes('apple') && matches.includes('app') && matches.includes('apricot'), 'Finds all ap words');
        assert(!matches.includes('banana'), 'Does not include banana in ap');
      `,
      requiredPatterns: ['class Trie', 'insert', 'search', 'startsWith'],
    },
  },
  {
    id: 'bench_codegen_async_priority_queue',
    name: 'Concurrency-Throttled Priority Job Queue',
    category: 'CODE_GENERATION',
    subcategory: 'async_concurrency',
    difficulty: 'HIGH',
    prompt: `Implement an AsyncPriorityQueue with maximum concurrency C.
Jobs have \`priority: number\` (higher number = executes earlier).
Method \`push<T>(task: () => Promise<T>, priority: number): Promise<T>\`.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Queues tasks by priority and runs up to concurrency limit',
      requiredPatterns: ['class AsyncPriorityQueue', 'push', 'priority'],
    },
  },
  {
    id: 'bench_codegen_event_emitter_typed',
    name: 'Strictly Typed Event Emitter',
    category: 'CODE_GENERATION',
    subcategory: 'design_patterns',
    difficulty: 'LOW',
    prompt: `Implement a lightweight TypedEventEmitter class with \`on(event, cb)\`, \`emit(event, ...args)\`, and \`off(event, cb)\`.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Registers listeners, fires callbacks with arguments, removes listeners',
      testCode: `
        const emitter = new TypedEventEmitter();
        let val = 0;
        const cb = (x) => { val += x; };
        emitter.on('add', cb);
        emitter.emit('add', 5);
        assert(val === 5, 'Callback was called with 5');
        emitter.off('add', cb);
        emitter.emit('add', 10);
        assert(val === 5, 'Callback removed so val remains 5');
      `,
      requiredPatterns: ['class TypedEventEmitter', 'on', 'emit', 'off'],
    },
  },
  {
    id: 'bench_codegen_circular_buffer',
    name: 'Fixed-Size Ring Buffer (Circular Buffer)',
    category: 'CODE_GENERATION',
    subcategory: 'data_structure',
    difficulty: 'LOW',
    prompt: `Implement a CircularBuffer<T> of fixed capacity.
When full, \`push(item)\` overwrites the oldest element.
\`pop()\` returns the oldest element or null if empty.
\`size()\` returns current item count.`,
    criteria: {
      method: 'test_execution',
      expectedBehavior: 'Overwrites oldest on overflow, pops in FIFO order',
      testCode: `
        const buf = new CircularBuffer(3);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.push(4); // overwrites 1
        assert(buf.size() === 3, 'Size is capped at 3');
        assert(buf.pop() === 2, 'Oldest remaining is 2');
        assert(buf.pop() === 3, 'Next is 3');
        assert(buf.pop() === 4, 'Next is 4');
        assert(buf.pop() === null || buf.pop() === undefined, 'Empty buffer');
      `,
      requiredPatterns: ['class CircularBuffer', 'push', 'pop', 'size'],
    },
  },

  // =========================================================================
  // 3. REFACTORING (6 benchmarks)
  // =========================================================================
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
  {
    id: 'bench_refactor_god_class_to_single_responsibility',
    name: 'Decompose Monolithic God Class into SRP Components',
    category: 'REFACTORING',
    subcategory: 'clean_architecture',
    difficulty: 'HIGH',
    prompt: `Decompose this God Class UserManager that handles validation, hashing, database saving, email notifications, and PDF invoicing into distinct single-responsibility classes:
- \`UserValidator\`
- \`PasswordHasher\`
- \`UserRepository\`
- \`NotificationService\``,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Splits concerns into separate single responsibility services',
      requiredPatterns: ['class UserValidator', 'class PasswordHasher', 'class UserRepository', 'class NotificationService'],
    },
  },
  {
    id: 'bench_refactor_switch_statement_to_strategy_pattern',
    name: 'Replace Complex Conditionals with Strategy Pattern',
    category: 'REFACTORING',
    subcategory: 'design_patterns',
    difficulty: 'LOW',
    prompt: `Refactor this discount calculation switch statement into a Strategy map pattern:
\`\`\`typescript
function calculateDiscount(type: string, amount: number): number {
  switch(type) {
    case 'VIP': return amount * 0.2;
    case 'STUDENT': return amount * 0.15;
    case 'COUPON': return Math.min(amount, 10);
    default: return 0;
  }
}
\`\`\``,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Uses lookup map or polymorphic strategies instead of switch/case',
      requiredPatterns: ['Record', 'VIP', 'STUDENT', 'COUPON'],
      forbiddenPatterns: ['switch (type)', 'switch(type)'],
    },
  },
  {
    id: 'bench_refactor_mutable_state_to_pure_fp',
    name: 'Transform Impure State Mutator to Pure Functional Pipeline',
    category: 'REFACTORING',
    subcategory: 'functional_programming',
    difficulty: 'MEDIUM',
    prompt: `Refactor this mutating function into a pure function using immutable array transformations:
\`\`\`typescript
function processOrders(orders: any[]) {
  const res = [];
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].status === 'PAID') {
      orders[i].tax = orders[i].amount * 0.1;
      res.push(orders[i]);
    }
  }
  return res;
}
\`\`\`
Must not mutate input orders array or objects. Use map, filter, and object spread.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Uses pure filter and map without mutating original objects',
      requiredPatterns: ['filter', 'map', '...'],
      forbiddenPatterns: ['res.push', 'orders[i].tax ='],
    },
  },
  {
    id: 'bench_refactor_nested_ternaries_to_guard_clauses',
    name: 'Flatten Deeply Nested Ternaries to Readable Guard Clauses',
    category: 'REFACTORING',
    subcategory: 'clean_code',
    difficulty: 'LOW',
    prompt: `Refactor this unreadable nested ternary into early return guard clauses:
\`\`\`typescript
function getAccessLevel(user: any): string {
  return !user ? 'ANONYMOUS' : user.isBanned ? 'BANNED' : user.isAdmin ? 'ADMIN' : user.isPremium ? 'PREMIUM' : 'USER';
}
\`\`\``,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Uses clean guard clauses and early returns',
      requiredPatterns: ['if (!user)', 'return', 'ANONYMOUS', 'BANNED', 'ADMIN'],
      forbiddenPatterns: ['? user.isBanned ?'],
    },
  },
  {
    id: 'bench_refactor_blocking_io_to_streaming',
    name: 'Transform In-Memory Buffer Processing to Async Iterable Streams',
    category: 'REFACTORING',
    subcategory: 'streaming_io',
    difficulty: 'EXTREME',
    prompt: `Refactor this 2GB JSON array parser from synchronous fs.readFileSync into an async streaming pipeline using AsyncIterable and Transform stream chunks.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Uses async iterators or streams to avoid buffering full payload into RAM',
      requiredPatterns: ['AsyncIterable', 'for await', 'stream'],
      forbiddenPatterns: ['fs.readFileSync'],
    },
  },

  // =========================================================================
  // 4. TEST_GENERATION (6 benchmarks)
  // =========================================================================
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
      requiredPatterns: ['describe', 'it(', 'expect', 'negative', 'delimiter'],
    },
  },
  {
    id: 'bench_testing_jwt_token_validator',
    name: 'Security & Edge Case Test Suite for JWT Token Validator',
    category: 'TEST_GENERATION',
    subcategory: 'security_testing',
    difficulty: 'HIGH',
    prompt: `Generate test cases for JWT authentication validator \`verifyToken(token: string, secret: string)\`.
Must test:
- Valid token signature
- Expired token (exp in past)
- Algorithm 'none' attack rejection
- Tampered payload signature mismatch
- Malformed header (non-base64)`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Covers expired tokens, none algorithm attack, tampered payloads, and malformed base64',
      requiredPatterns: ['describe', 'expired', 'none', 'tampered', 'expect'],
    },
  },
  {
    id: 'bench_testing_state_machine_transitions',
    name: 'State Machine Valid and Invalid Transition Test Matrix',
    category: 'TEST_GENERATION',
    subcategory: 'state_machine_testing',
    difficulty: 'LOW',
    prompt: `Write tests for OrderStateMachine transitions:
PENDING -> PAID (allowed)
PENDING -> CANCELLED (allowed)
PAID -> SHIPPED (allowed)
PAID -> CANCELLED (disallowed)
SHIPPED -> DELIVERED (allowed)
DELIVERED -> PENDING (disallowed)`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Tests all valid transitions and asserts throws on illegal transitions',
      requiredPatterns: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'expect'],
    },
  },
  {
    id: 'bench_testing_retry_with_exponential_backoff',
    name: 'Asynchronous Retry with Exponential Backoff Test Suite',
    category: 'TEST_GENERATION',
    subcategory: 'async_testing',
    difficulty: 'HIGH',
    prompt: `Write unit tests for \`retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 100)\`.
Test that:
1. Succeeds on first attempt without delay
2. Retries on transient failure and succeeds on 2nd attempt
3. Reaches maxRetries and rejects with final error
4. Respects exponential backoff delay progression (100ms, 200ms, 400ms).`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Tests retry attempts, exponential timing progression, and error bubbling',
      requiredPatterns: ['retryWithBackoff', 'maxRetries', 'expect', 'it('],
    },
  },
  {
    id: 'bench_testing_money_value_object',
    name: 'Domain-Driven Design Money Value Object Tests',
    category: 'TEST_GENERATION',
    subcategory: 'value_object_testing',
    difficulty: 'LOW',
    prompt: `Write unit tests for Money value object:
- Addition of same currency
- Disallow addition of different currencies (throws CurrencyMismatchError)
- Multiplication by scalar rate
- Immutability of operands after operation.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Tests same currency addition, currency mismatch error, and immutability',
      requiredPatterns: ['Money', 'currency', 'expect', 'it('],
    },
  },
  {
    id: 'bench_testing_concurrent_id_generator',
    name: 'Collision Resistance Test Suite for Distributed Snowflake ID Generator',
    category: 'TEST_GENERATION',
    subcategory: 'concurrency_testing',
    difficulty: 'EXTREME',
    prompt: `Write high-concurrency property tests asserting zero collision across 10,000 parallel ID generations within the same millisecond.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Generates parallel promises and asserts Set size equals total generated count',
      requiredPatterns: ['Set', 'Promise.all', 'expect', 'size'],
    },
  },

  // =========================================================================
  // 5. SECURITY (6 benchmarks)
  // =========================================================================
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
      requiredPatterns: ['path.resolve', 'startsWith', '403'],
      forbiddenPatterns: ['res.sendFile(filePath)'],
    },
  },
  {
    id: 'bench_security_sql_injection_parameterization',
    name: 'SQL Injection Remediation with Parameterized Queries',
    category: 'SECURITY',
    subcategory: 'sql_injection',
    difficulty: 'MEDIUM',
    prompt: `Remediate this vulnerable SQL query using parameter binding:
\`\`\`typescript
async function searchUsers(username: string, role: string) {
  const sql = \`SELECT * FROM users WHERE username = '\${username}' AND role = '\${role}'\`;
  return db.query(sql);
}
\`\`\`
Use parameterized values \`$1, $2\` or \`?, ?\` to neutralize SQL injection.`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Replaces string interpolation with parameterized query array',
      requiredPatterns: ['query', 'SELECT * FROM users WHERE', '$1', '$2'],
      forbiddenPatterns: ['${username}'],
    },
  },
  {
    id: 'bench_security_xss_sanitization_csp',
    name: 'Stored XSS Remediation with DOMPurify and Contextual Escaping',
    category: 'SECURITY',
    subcategory: 'xss_defense',
    difficulty: 'LOW',
    prompt: `Secure this user comment rendering template against Cross-Site Scripting (XSS):
\`\`\`typescript
function renderComment(comment: string) {
  return \`<div class="comment">\${comment}</div>\`;
}
\`\`\`
Sanitize or HTML-escape special characters (\`<\`, \`>\`, \`&\`, \`"\`, \`'\`).`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Escapes HTML entities or sanitizes input to prevent script execution',
      requiredPatterns: ['&lt;', '&gt;', '&amp;', 'replace'],
    },
  },
  {
    id: 'bench_security_cors_origin_misconfiguration',
    name: 'CORS Wildcard with Credentials Remediation',
    category: 'SECURITY',
    subcategory: 'cors_configuration',
    difficulty: 'LOW',
    prompt: `Fix this insecure Express CORS configuration:
\`\`\`typescript
app.use(cors({ origin: '*', credentials: true }));
\`\`\`
Configure a strict whitelist of allowed domains and reject untrusted origins.`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Validates origin against whitelist array rather than wildcard',
      requiredPatterns: ['origin', 'includes', 'whitelist'],
      forbiddenPatterns: ["origin: '*'"],
    },
  },
  {
    id: 'bench_security_jwt_algorithm_confusion',
    name: 'JWT Algorithm Confusion and Key Confusion Attack Defense',
    category: 'SECURITY',
    subcategory: 'jwt_security',
    difficulty: 'HIGH',
    prompt: `Secure this JWT verification function against HMAC-SHA/RSA public key confusion attack where an attacker signs a token using the RS256 public key as an HS256 HMAC secret:
\`\`\`typescript
function verifyAuth(token: string, publicKey: string) {
  return jwt.verify(token, publicKey);
}
\`\`\`
Explicitly specify \`algorithms: ['RS256']\` in verify options.`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Explicitly enforces algorithms whitelist in jwt.verify',
      requiredPatterns: ['algorithms', 'RS256'],
    },
  },
  {
    id: 'bench_security_ssrf_internal_ip_blocker',
    name: 'Server-Side Request Forgery (SSRF) Defense & IP Blacklisting',
    category: 'SECURITY',
    subcategory: 'ssrf_defense',
    difficulty: 'EXTREME',
    prompt: `Write a secure URL fetcher that prevents SSRF attacks targeting internal metadata endpoints (169.254.169.254, 127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, IPv6 ::1, localhost).
Resolve DNS first, validate the resolved IP is public, then request using the validated IP.`,
    criteria: {
      method: 'security_validation',
      expectedBehavior: 'Resolves IP and blocks private ranges and metadata endpoints',
      requiredPatterns: ['169.254', '127.', '10.', '192.168', 'dns'],
    },
  },

  // =========================================================================
  // 6. ARCHITECTURE (6 benchmarks)
  // =========================================================================
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
  {
    id: 'bench_architecture_cqrs_event_sourcing',
    name: 'CQRS with Event Sourcing Aggregate Architecture',
    category: 'ARCHITECTURE',
    subcategory: 'cqrs_event_sourcing',
    difficulty: 'EXTREME',
    prompt: `Design a CQRS Event-Sourced Banking Aggregate in TypeScript:
- \`AccountAggregate\` with \`apply(event)\`
- Events: \`AccountOpened\`, \`MoneyDeposited\`, \`MoneyWithdrawn\`
- \`EventStore\` interface with \`append(streamId, events, expectedVersion)\`
- Optimistic concurrency control.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Implements event store interface, aggregate root, and event applying methods',
      requiredPatterns: ['AccountAggregate', 'EventStore', 'AccountOpened', 'MoneyDeposited', 'expectedVersion'],
    },
  },
  {
    id: 'bench_architecture_repository_unit_of_work',
    name: 'Unit of Work and Generic Repository Pattern',
    category: 'ARCHITECTURE',
    subcategory: 'domain_persistence',
    difficulty: 'MEDIUM',
    prompt: `Design a Unit of Work and Repository pattern in TypeScript with \`commit()\`, \`rollback()\`, \`registerNew()\`, \`registerDirty()\`, \`registerDeleted()\`.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Coordinates transactional database operations across multiple repositories',
      requiredPatterns: ['interface IUnitOfWork', 'interface IRepository', 'commit', 'rollback'],
    },
  },
  {
    id: 'bench_architecture_plugin_microkernel',
    name: 'Extensible Microkernel Plugin Architecture',
    category: 'ARCHITECTURE',
    subcategory: 'extensibility',
    difficulty: 'HIGH',
    prompt: `Design a Microkernel Plugin System in TypeScript:
- \`PluginContext\` and \`IPlugin\` interface with \`initialize(context)\`, \`destroy()\`
- Lifecycle hooks (beforeRequest, afterRequest)
- \`PluginRegistry\` with dependency resolution and topological activation order.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Defines plugin lifecycle, hooks, and activation registry',
      requiredPatterns: ['interface IPlugin', 'PluginContext', 'initialize', 'destroy', 'register'],
    },
  },
  {
    id: 'bench_architecture_layered_mvc_clean',
    name: 'Clean Layered Separation of Controller, Service, and DAL',
    category: 'ARCHITECTURE',
    subcategory: 'layered_architecture',
    difficulty: 'LOW',
    prompt: `Define clean interfaces separating HTTP Controller, Business Logic Service, and Data Access Layer for a User Profile module in TypeScript.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Strict separation between HTTP layer, business service, and database access',
      requiredPatterns: ['UserController', 'UserService', 'UserDAL', 'interface'],
    },
  },
  {
    id: 'bench_architecture_circuit_breaker_distributed',
    name: 'Distributed Circuit Breaker State Machine Architecture',
    category: 'ARCHITECTURE',
    subcategory: 'fault_tolerance',
    difficulty: 'HIGH',
    prompt: `Design a Circuit Breaker pattern with 3 states: \`CLOSED\`, \`OPEN\`, \`HALF_OPEN\`.
Define failure thresholds, reset timeout, and fallback execution.`,
    criteria: {
      method: 'deterministic_rules',
      expectedBehavior: 'Models CLOSED -> OPEN on failure threshold and OPEN -> HALF_OPEN on reset timeout',
      requiredPatterns: ['CLOSED', 'OPEN', 'HALF_OPEN', 'CircuitBreaker', 'threshold'],
    },
  },

  // =========================================================================
  // 7. REASONING (6 benchmarks)
  // =========================================================================
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
  {
    id: 'bench_reasoning_byzantine_fault_tolerance',
    name: 'Byzantine Fault Tolerance Consensus Bounds Reasoning',
    category: 'REASONING',
    subcategory: 'distributed_systems',
    difficulty: 'EXTREME',
    prompt: `In a distributed network of N nodes with F Byzantine (arbitrarily malicious) nodes:
1. What is the strict minimum number of total nodes N required to achieve consensus?
2. Why is 3F + 1 strictly required instead of 2F + 1? Explain quorum intersection and non-responsive node ambiguity.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'States 3F + 1 bound and explains quorum intersection',
      requiredPatterns: ['3F + 1', 'quorum', 'Byzantine'],
    },
  },
  {
    id: 'bench_reasoning_knapsack_dynamic_programming',
    name: '0/1 Knapsack Optimal Substructure Deduction',
    category: 'REASONING',
    subcategory: 'dynamic_programming',
    difficulty: 'MEDIUM',
    prompt: `Given knapsack capacity W = 7 and items:
Item 1: weight 2, value 3
Item 2: weight 3, value 4
Item 3: weight 4, value 5
Item 4: weight 5, value 6

What is the exact maximum total value achievable? State the exact subset of items chosen and total weight.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Calculates maximum value 9 choosing Items 1, 2, and either 3 or optimal combination (weight 5 or 7)',
      requiredPatterns: ['9'],
    },
  },
  {
    id: 'bench_reasoning_interval_intersection_scheduling',
    name: 'Maximum Non-Overlapping Meeting Intervals Greedy Proof',
    category: 'REASONING',
    subcategory: 'greedy_algorithms',
    difficulty: 'LOW',
    prompt: `Given meeting intervals: [1, 4], [3, 5], [0, 6], [5, 7], [3, 8], [5, 9], [6, 10], [8, 11], [8, 12], [2, 13], [12, 14].
What is the maximum number of mutually non-overlapping meetings that can be scheduled?`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Computes maximum count 4 (e.g. [1,4], [5,7], [8,11], [12,14])',
      requiredPatterns: ['4'],
    },
  },
  {
    id: 'bench_reasoning_dining_philosophers_deadlock_free',
    name: 'Resource Hierarchy Solution to Dining Philosophers Problem',
    category: 'REASONING',
    subcategory: 'concurrency_reasoning',
    difficulty: 'HIGH',
    prompt: `Explain Dijkstra's resource hierarchy solution to prevent circular wait deadlock in the 5 Dining Philosophers problem.
State which chopstick the 5th philosopher must pick up first compared to the others.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Explains total order of resources and asymmetry of last philosopher',
      requiredPatterns: ['hierarchy', 'circular wait', 'order'],
    },
  },
  {
    id: 'bench_reasoning_type_variance_covariance_contravariance',
    name: 'Type Variance Formal Reasoning in Subtyping',
    category: 'REASONING',
    subcategory: 'type_theory',
    difficulty: 'MEDIUM',
    prompt: `If Dog is a subtype of Animal (Dog <: Animal):
1. Is \`() => Dog\` a subtype of \`() => Animal\`? (Covariant return)
2. Is \`(d: Dog) => void\` a subtype of \`(a: Animal) => void\` or vice versa? (Contravariant parameters)
Explain the Liskov Substitution Principle rule for function subtyping.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Identifies covariance in return positions and contravariance in parameter positions',
      requiredPatterns: ['covariant', 'contravariant', 'Liskov'],
    },
  },

  // =========================================================================
  // 8. MATHEMATICS (6 benchmarks)
  // =========================================================================
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
  {
    id: 'bench_math_fibonacci_matrix_exponentiation',
    name: 'Matrix Exponentiation for Nth Fibonacci Term',
    category: 'MATHEMATICS',
    subcategory: 'discrete_math',
    difficulty: 'HIGH',
    prompt: `Using the transformation matrix [[1, 1], [1, 0]], compute the 12th Fibonacci number F(12) where F(0)=0, F(1)=1, F(2)=1...
State the exact integer value of F(12).`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Correctly states F(12) = 144',
      requiredPatterns: ['144'],
    },
  },
  {
    id: 'bench_math_gcd_extended_euclidean',
    name: 'Extended Euclidean Algorithm Bézout Coefficients',
    category: 'MATHEMATICS',
    subcategory: 'number_theory',
    difficulty: 'LOW',
    prompt: `Find gcd(240, 46) and integer coefficients x and y such that 240*x + 46*y = gcd(240, 46).
State the GCD.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'States GCD = 2',
      requiredPatterns: ['2'],
    },
  },
  {
    id: 'bench_math_bayesian_posterior_probability',
    name: 'Bayes Theorem Posterior Probability Calculation',
    category: 'MATHEMATICS',
    subcategory: 'probability',
    difficulty: 'MEDIUM',
    prompt: `A disease has a 1% prevalence in a population.
A diagnostic test has a 95% sensitivity (true positive rate) and 90% specificity (true negative rate, so 10% false positive rate).
If a random person tests positive, what is the exact posterior probability P(Disease | Positive)?
Show computation using Bayes theorem. Give the percentage rounded to two decimal places.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'Computes (0.01 * 0.95) / (0.01 * 0.95 + 0.99 * 0.10) = 0.0095 / (0.0095 + 0.0990) = 0.0095 / 0.1085 = ~8.76%',
      requiredPatterns: ['8.76'],
    },
  },
  {
    id: 'bench_math_convex_hull_orientation',
    name: 'Cross Product 2D Point Orientation Predicate',
    category: 'MATHEMATICS',
    subcategory: 'computational_geometry',
    difficulty: 'HIGH',
    prompt: `Given three 2D points P1(2, 3), P2(5, 7), and P3(8, 12):
Compute the 2D cross product (P2.x - P1.x)*(P3.y - P1.y) - (P2.y - P1.y)*(P3.x - P1.x).
State whether the turn from P1->P2 to P2->P3 is Collinear, Clockwise, or Counter-Clockwise.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: '(5-2)*(12-3) - (7-3)*(8-2) = 3*9 - 4*6 = 27 - 24 = +3 (> 0 = Counter-Clockwise)',
      requiredPatterns: ['3', 'Counter-Clockwise'],
    },
  },
  {
    id: 'bench_math_modular_inverse_rsa',
    name: 'Modular Multiplicative Inverse in RSA Key Generation',
    category: 'MATHEMATICS',
    subcategory: 'cryptography_math',
    difficulty: 'EXTREME',
    prompt: `In RSA encryption with primes p = 61 and q = 53:
1. Compute Euler's totient phi(n) = (p-1)*(q-1).
2. Given public exponent e = 17, compute the private key exponent d such that (d * 17) mod phi(n) = 1.
State the exact integer value of d.`,
    criteria: {
      method: 'exact_match',
      expectedBehavior: 'phi(n) = 60 * 52 = 3120. Modular inverse of 17 mod 3120 = 2753 (since 17 * 2753 = 46801 = 15 * 3120 + 1).',
      requiredPatterns: ['3120', '2753'],
    },
  },
];
