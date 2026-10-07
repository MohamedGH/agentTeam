import assert from 'node:assert';
import { routeManager, AppRoute } from '../../src/managers/routeManager';
import { errorManager } from '../../src/managers/errorManager';
import { workflowStateManager } from '../../src/managers/workflowStateManager';

export async function runUxRouteManagerUnitTests() {
  console.log('\n--- [Unit Test] UX Architecture, Route Manager & State Coordination ---');

  // Test 1: Primary Page Mapping
  const dashboardPrimary = routeManager.getPrimaryPage('dashboard');
  assert.strictEqual(dashboardPrimary, 'dashboard');

  const studioLegacy = routeManager.getPrimaryPage('studio');
  assert.strictEqual(studioLegacy, 'dashboard', 'Legacy studio route must map to primary page dashboard');

  const buildPrimary = routeManager.getPrimaryPage('build');
  assert.strictEqual(buildPrimary, 'build');

  const workspaceLegacy = routeManager.getPrimaryPage('workspace');
  assert.strictEqual(workspaceLegacy, 'build', 'Legacy workspace route must map to primary page build');

  const intelligencePrimary = routeManager.getPrimaryPage('intelligence');
  assert.strictEqual(intelligencePrimary, 'intelligence');

  const julesLegacy = routeManager.getPrimaryPage('jules');
  assert.strictEqual(julesLegacy, 'intelligence', 'Legacy jules route must map to primary page intelligence');

  const autoImproveLegacy = routeManager.getPrimaryPage('auto-improve');
  assert.strictEqual(autoImproveLegacy, 'intelligence', 'Legacy auto-improve route must map to primary page intelligence');

  const adaptiveLlmLegacy = routeManager.getPrimaryPage('adaptive-llm');
  assert.strictEqual(adaptiveLlmLegacy, 'intelligence', 'Legacy adaptive-llm route must map to primary page intelligence');

  const systemPrimary = routeManager.getPrimaryPage('system');
  assert.strictEqual(systemPrimary, 'system');

  const quotaLegacy = routeManager.getPrimaryPage('quota');
  assert.strictEqual(quotaLegacy, 'system', 'Legacy quota route must map to primary page system');

  const rolesLegacy = routeManager.getPrimaryPage('roles');
  assert.strictEqual(rolesLegacy, 'system', 'Legacy roles route must map to primary page system');

  const githubSettingsLegacy = routeManager.getPrimaryPage('github-settings');
  assert.strictEqual(githubSettingsLegacy, 'system', 'Legacy github-settings route must map to primary page system');

  const activityPrimary = routeManager.getPrimaryPage('activity');
  assert.strictEqual(activityPrimary, 'activity');

  console.log('✅ PASS: Primary page and legacy alias resolution verified for all 5 application domains');

  // Test 2: Navigation and Subscription Listener
  let notifiedState: any = null;
  const unsubscribe = routeManager.subscribe((state) => {
    notifiedState = state;
  });

  routeManager.navigate('build', { subTab: 'workspace', file: 'src/main.ts' });
  assert.ok(notifiedState, 'Subscriber must be notified on navigate');
  assert.strictEqual(notifiedState.currentRoute, 'build');
  assert.strictEqual(notifiedState.primaryPage, 'build');
  assert.strictEqual(notifiedState.params.subTab, 'workspace');
  assert.strictEqual(notifiedState.params.file, 'src/main.ts');

  // Navigate to intelligence with subTab
  routeManager.navigate('intelligence', { subTab: 'jules' });
  assert.strictEqual(notifiedState.currentRoute, 'intelligence');
  assert.strictEqual(notifiedState.primaryPage, 'intelligence');
  assert.strictEqual(notifiedState.subTab, 'jules');

  unsubscribe();
  console.log('✅ PASS: RouteManager subscription and parametric navigation verified');

  // Test 3: Error Manager Classification & Clean Formatting
  const classifiedError = errorManager.parseError(
    new Error('GitHub API rate limit exceeded (429)'),
    'Test Action Context'
  );
  assert.strictEqual(classifiedError.code, 'RATE_LIMIT_429');
  assert.ok(classifiedError.remediation, 'Classified error must contain remediation advice');
  assert.ok(classifiedError.message.includes('Test Action Context'));
  console.log('✅ PASS: ErrorManager classified actionable error with code and remediation');

  // Test 4: Workflow State Manager Status Integrity
  workflowStateManager.reset();
  assert.strictEqual(workflowStateManager.getState().executionState, 'IDLE');
  workflowStateManager.startExecution('mock-fast-model', 'mock');
  assert.strictEqual(workflowStateManager.getState().executionState, 'RUNNING');
  assert.strictEqual(workflowStateManager.getState().currentPhase, 1);
  workflowStateManager.cancelExecution();
  assert.strictEqual(workflowStateManager.getState().executionState, 'CANCELLED');
  workflowStateManager.reset();

  console.log('✅ PASS: WorkflowStateManager state transitions align with UI state design system');
  console.log('✅ UX Route & State Manager Unit Tests Passed');
}
