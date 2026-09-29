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
    assert.strictEqual(unmatchedState.ciStatus, 'QUEUED'); // "CI en attente de création"
    console.log('✅ PASS: ZERO fallback to runs[0] when targetSha has no matching run (strictly null / QUEUED)');

    // Test 6: Max poll attempts reached triggers NOT_FOUND without inventing run
    for (let i = 0; i < 25; i++) {
      await manager.fetchCiRuns(targetShaUnmatched);
    }
    const timedOutState = manager.getState();
    assert.strictEqual(timedOutState.ciStatus, 'NOT_FOUND');
    assert.strictEqual(timedOutState.ciRun, null);
    console.log('✅ PASS: Polling timeout correctly sets state to NOT_FOUND with zero fabricated runs');

    // Test 7: Completed CI stops polling and updates conclusion
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
    assert.strictEqual(completedState.ciStatus, 'COMPLETED');
    assert.strictEqual(completedState.ciConclusion, 'success');
    assert.strictEqual(completedState.isPolling, false);
    console.log('✅ PASS: Completed CI stops polling and sets status to COMPLETED with success conclusion');

    // Test 8: Reset restores state to IDLE
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
