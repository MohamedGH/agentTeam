import assert from 'assert';
import { DeliveryStateManager } from '../../src/managers/deliveryStateManager';

export async function runDeliveryStateManagerTests() {
  console.log('\n--- [Unit Test] DeliveryStateManager & CI Traceability ---');

  // Test 1: Initial state is clean and IDLE
  const manager = new DeliveryStateManager();
  const initial = manager.getState();
  assert.strictEqual(initial.pushStatus, 'IDLE');
  assert.strictEqual(initial.ciStatus, 'IDLE');
  assert.strictEqual(initial.commitSha, null);
  assert.strictEqual(initial.ciRun, null);
  assert.strictEqual(initial.trackedSha, null);
  assert.strictEqual(initial.isPolling, false);
  console.log('✅ PASS: Initial delivery state is correctly IDLE with no fabricated runs');

  // Test 2: Set repository and branch
  manager.setRepositoryAndBranch('MohamedGH/agentTeam', 'main');
  assert.strictEqual(manager.getState().repository, 'MohamedGH/agentTeam');
  assert.strictEqual(manager.getState().branch, 'main');
  console.log('✅ PASS: Repository and branch updated synchronously');

  // Test 3: Simulation of pushMain and commitSha recording
  // Mock global fetch for push-main
  const originalFetch = globalThis.fetch;
  const mockCommitSha = 'abc1234def567890';

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/github/push-main')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          push: {
            pushed: true,
            commitSha: mockCommitSha,
            branch: 'main',
          },
          ciRun: null, // CI not yet created at push moment
          jobs: [],
        }),
      } as any;
    }

    if (urlStr.includes('/api/github/ci-runs')) {
      // Simulate CI response when querying by head_sha
      const hasSha = urlStr.includes(`head_sha=${mockCommitSha}`);
      if (hasSha) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            selectedRun: {
              id: 987654,
              name: 'Build and Test',
              head_sha: mockCommitSha,
              status: 'in_progress',
              conclusion: null,
              html_url: 'https://github.com/MohamedGH/agentTeam/actions/runs/987654',
            },
            runs: [],
            jobs: [
              {
                id: 1,
                name: 'test',
                status: 'in_progress',
                conclusion: null,
                steps: [{ name: 'Run tests', status: 'in_progress', conclusion: null }],
              },
            ],
          }),
        } as any;
      }
    }

    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) } as any;
  };

  try {
    const pushRes = await manager.pushMain({ repository: 'MohamedGH/agentTeam', branch: 'main' });
    assert.strictEqual(pushRes.success, true);
    assert.strictEqual(pushRes.commitSha, mockCommitSha);

    const pushedState = manager.getState();
    assert.strictEqual(pushedState.pushStatus, 'COMPLETED');
    assert.strictEqual(pushedState.commitSha, mockCommitSha);
    assert.strictEqual(pushedState.trackedSha, mockCommitSha);
    console.log('✅ PASS: Push succeeded and trackedSha set to exact commitSha');

    // Test 4: Polling correlates strictly with head_sha === mockCommitSha
    await manager.fetchCiRuns(mockCommitSha);
    const trackedState = manager.getState();
    assert.strictEqual(trackedState.ciRunId, 987654);
    assert.strictEqual(trackedState.ciHeadSha, mockCommitSha);
    assert.strictEqual(trackedState.ciRun?.head_sha, mockCommitSha);
    assert.strictEqual(trackedState.ciStatus, 'RUNNING');
    assert.strictEqual(trackedState.jobs.length, 1);
    assert.ok(trackedState.updatedAt);
    console.log('✅ PASS: CI Run correlated strictly by head_sha with jobs, steps, ciHeadSha, and updatedAt');

    // Test 5: ZERO Fallback to runs[0] when targetSha is not found in returned runs
    globalThis.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          selectedRun: null, // None matching targetSha
          runs: [
            {
              id: 111111,
              name: 'Other commit run',
              head_sha: 'different_sha_9999',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        }),
      } as any;
    };

    const targetShaUnmatched = 'fresh_commit_not_in_ci_yet';
    await manager.fetchCiRuns(targetShaUnmatched);

    const unmatchedState = manager.getState();
    // Invariant: ciRun must NOT be set to runs[0] (id: 111111)
    assert.strictEqual(unmatchedState.ciRun, null);
    assert.strictEqual(unmatchedState.ciRunId, null);
    assert.strictEqual(unmatchedState.ciStatus, 'WAITING_WORKFLOW'); // "CI en attente de création"
    console.log('✅ PASS: ZERO fallback to runs[0] when targetSha has no matching run (strictly null / WAITING_WORKFLOW)');

    // Test 6: Max poll attempts reached triggers RUN_NOT_FOUND_FOR_SHA without inventing run
    for (let i = 0; i < 25; i++) {
      await manager.fetchCiRuns(targetShaUnmatched);
    }
    const timedOutState = manager.getState();
    assert.strictEqual(timedOutState.ciStatus, 'RUN_NOT_FOUND_FOR_SHA');
    assert.strictEqual(timedOutState.ciRun, null);
    console.log('✅ PASS: Polling timeout correctly sets state to RUN_NOT_FOUND_FOR_SHA with zero fabricated runs');

    // Test 7: Completed CI stops polling and updates to TERMINAL_SUCCESS
    globalThis.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          selectedRun: {
            id: 987654,
            name: 'Build and Test',
            head_sha: mockCommitSha,
            status: 'completed',
            conclusion: 'success',
          },
          runs: [],
          jobs: [],
        }),
      } as any;
    };

    await manager.fetchCiRuns(mockCommitSha);
    const completedState = manager.getState();
    assert.strictEqual(completedState.ciStatus, 'TERMINAL_SUCCESS');
    assert.strictEqual(completedState.ciConclusion, 'success');
    assert.strictEqual(completedState.isPolling, false);
    console.log('✅ PASS: Completed CI stops polling and sets status to TERMINAL_SUCCESS');

    // Test 8: Failed CI stops polling and updates to TERMINAL_FAILURE
    globalThis.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          selectedRun: {
            id: 987654,
            name: 'Build and Test',
            head_sha: mockCommitSha,
            status: 'completed',
            conclusion: 'failure',
          },
          runs: [],
          jobs: [],
        }),
      } as any;
    };
    await manager.fetchCiRuns(mockCommitSha);
    const failedState = manager.getState();
    assert.strictEqual(failedState.ciStatus, 'TERMINAL_FAILURE');
    assert.strictEqual(failedState.ciConclusion, 'failure');
    console.log('✅ PASS: Failed CI sets status to TERMINAL_FAILURE');

    // Test 9: Network error handling preserves state and counts towards polling limit
    globalThis.fetch = async () => {
      throw new Error('Connection refused');
    };
    manager.reset();
    manager.setRepositoryAndBranch('MohamedGH/agentTeam', 'main');
    (manager as any).state.trackedSha = mockCommitSha;
    await manager.fetchCiRuns(mockCommitSha);
    const netErrState = manager.getState();
    assert.strictEqual(netErrState.ciStatus, 'POLLING_FAILED_NETWORK');
    assert.strictEqual(netErrState.pollAttempts, 1);
    assert.strictEqual(netErrState.trackedSha, mockCommitSha, 'trackedSha must be preserved during network error');
    console.log('✅ PASS: Network error records POLLING_FAILED_NETWORK and increments pollAttempts without losing trackedSha');

    // Test 10: Network error timeout after max attempts
    for (let i = 0; i < 25; i++) {
      await manager.fetchCiRuns(mockCommitSha);
    }
    assert.strictEqual(manager.getState().ciStatus, 'POLLING_FAILED_TIMEOUT');
    console.log('✅ PASS: Repeated network errors trigger POLLING_FAILED_TIMEOUT after MAX_POLL_ATTEMPTS');

    // Test 11: Concurrency protection (race condition guard when trackedSha changes)
    manager.reset();
    (manager as any).state.trackedSha = 'sha-A';
    let delayedResolve: (value: any) => void;
    const delayedPromise = new Promise((resolve) => {
      delayedResolve = resolve;
    });
    globalThis.fetch = async () => {
      return delayedPromise as any;
    };
    const inFlightFetch = manager.fetchCiRuns('sha-A');
    // Change tracked SHA while fetch is in-flight
    (manager as any).state.trackedSha = 'sha-B';
    delayedResolve!({
      ok: true,
      json: async () => ({
        success: true,
        selectedRun: { id: 777, head_sha: 'sha-A', status: 'completed', conclusion: 'success' },
      }),
    });
    await inFlightFetch;
    assert.strictEqual(manager.getState().trackedSha, 'sha-B');
    assert.strictEqual(manager.getState().ciRunId, null, 'Stale async response must be discarded when trackedSha changed');
    console.log('✅ PASS: Concurrency guard strictly discards stale responses when trackedSha changes');

    // Test 11b: In-flight request deduplication prevents overlapping fetches for the same SHA
    manager.reset();
    (manager as any).state.trackedSha = 'sha-dedup';
    let fetchCallCount = 0;
    let resolveDedup: (value: any) => void;
    const dedupPromise = new Promise((resolve) => {
      resolveDedup = resolve;
    });
    globalThis.fetch = async () => {
      fetchCallCount++;
      return dedupPromise as any;
    };
    const p1 = manager.fetchCiRuns('sha-dedup');
    const p2 = manager.fetchCiRuns('sha-dedup');
    resolveDedup!({
      ok: true,
      json: async () => ({
        success: true,
        selectedRun: { id: 888, head_sha: 'sha-dedup', status: 'completed', conclusion: 'success' },
      }),
    });
    await Promise.all([p1, p2]);
    assert.strictEqual(fetchCallCount, 1, 'Concurrent fetchCiRuns for the same SHA must share a single in-flight request');
    assert.strictEqual(manager.getState().ciRunId, 888);
    console.log('✅ PASS: In-flight guard deduplicates concurrent polling requests for the same SHA');

    // Test 12: Reset restores state to IDLE
    manager.reset();
    assert.strictEqual(manager.getState().ciStatus, 'IDLE');
    assert.strictEqual(manager.getState().commitSha, null);
    assert.strictEqual(manager.getState().isPolling, false);
    console.log('✅ PASS: Reset cleanly restores IDLE state and cancels timers');
  } finally {
    manager.stopCiPolling();
    globalThis.fetch = originalFetch;
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('deliveryStateManager.test')) {
  runDeliveryStateManagerTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('DeliveryStateManager unit tests failed:', err);
      process.exit(1);
    });
}
