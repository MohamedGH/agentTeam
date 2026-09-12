import assert from 'assert';
import { JulesAgent } from '../../server/codingAgents/julesAgent';
import { MockCodingAgent } from '../../server/codingAgents/mockCodingAgent';
import { codingAgentManager } from '../../server/codingAgents/codingAgentManager';
import { providerManager } from '../../server/providerManager';

export async function runCodingAgentsUnitTests() {
  console.log('\n--- [Unit Test] Google Jules & CodingAgentManager Architecture ---');

  // 1. Verify Architectural Separation
  // ProviderManager must NOT contain Jules (ProviderManager = LLM token/completion providers)
  const providerList = providerManager.getProvidersList().map((p) => p.id);
  assert.ok(!providerList.includes('jules' as any), 'ProviderManager must NOT register Jules as an LLM provider');
  console.log('✅ PASS: Strict separation verified: ProviderManager does not contain Jules');

  // CodingAgentManager must register Jules and Mock
  const registeredAgents = codingAgentManager.listAgents();
  const agentIds = registeredAgents.map((a) => a.id);
  assert.ok(agentIds.includes('jules'), 'CodingAgentManager must register Jules agent');
  assert.ok(agentIds.includes('mock'), 'CodingAgentManager must register Mock agent');
  console.log('✅ PASS: CodingAgentManager registers both jules and mock autonomous agents');

  // 2. Jules Agent Metadata & Capabilities
  const jules = codingAgentManager.getJules();
  assert.strictEqual(jules.id, 'jules');
  assert.strictEqual(jules.name, 'Google Jules');

  const julesInfo = jules.getInfo();
  assert.strictEqual(julesInfo.type, 'autonomous_agent');
  assert.strictEqual(julesInfo.capabilities.gitHubIntegration, true);
  assert.strictEqual(julesInfo.capabilities.autoPullRequests, true);
  assert.strictEqual(julesInfo.capabilities.multiStepPlanning, true);
  assert.ok(julesInfo.supportedAutomationModes.includes('AUTO_CREATE_PR'));
  console.log('✅ PASS: Jules agent metadata and capabilities are correctly defined');

  // 3. Source Resource Formatting (RFC & Jules API v1alpha spec)
  assert.strictEqual(
    jules.formatSourceResource('MohamedGH/agentTeam'),
    'sources/github/MohamedGH/agentTeam'
  );
  assert.strictEqual(
    jules.formatSourceResource('https://github.com/MohamedGH/agentTeam'),
    'sources/github/MohamedGH/agentTeam'
  );
  assert.strictEqual(
    jules.formatSourceResource('sources/github/MohamedGH/agentTeam'),
    'sources/github/MohamedGH/agentTeam'
  );
  console.log('✅ PASS: Source resource format adheres to Jules API sources/github/... specification');

  // 4. API Key Handling (Lazy Resolution & Never Hardcoded)
  const originalKey = process.env.JULES_API_KEY;
  delete process.env.JULES_API_KEY;
  assert.strictEqual(jules.isConfigured(), false, 'isConfigured should be false when JULES_API_KEY is not set');

  const unconfiguredResult = await jules.executeTask({
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Fix the DeepSeek provider',
  });
  assert.strictEqual(unconfiguredResult.status, 'FAILED');
  assert.ok(unconfiguredResult.summary.includes('JULES_API_KEY'));
  assert.strictEqual(unconfiguredResult.error, 'JULES_API_KEY is missing');
  console.log('✅ PASS: Unconfigured Jules execution gracefully returns actionable diagnostic without throwing');

  // Restore env if was set
  if (originalKey) {
    process.env.JULES_API_KEY = originalKey;
  }

  // 5. Mock Coding Agent Autonomous Execution & PR creation
  const mockAgent = codingAgentManager.getAgent('mock');
  assert.strictEqual(mockAgent.isConfigured(), true);

  const mockResult = await codingAgentManager.execute({
    agent: 'mock',
    repository: 'MohamedGH/agentTeam',
    branch: 'main',
    task: 'Fix the DeepSeek provider',
    automationMode: 'AUTO_CREATE_PR',
  });

  assert.strictEqual(mockResult.status, 'COMPLETED');
  assert.strictEqual(mockResult.repository, 'MohamedGH/agentTeam');
  assert.strictEqual(mockResult.branch, 'main');
  assert.ok(mockResult.prUrl?.includes('pull/42'), 'PR URL must be generated when AUTO_CREATE_PR is enabled');
  assert.ok(mockResult.gitBranch?.startsWith('jules/patch-'), 'Git branch should be isolated for the patch');
  assert.ok(mockResult.activities.length >= 3, 'Activities must be logged for planning, coding, and testing');
  console.log('✅ PASS: Autonomous coding task executed with automated Pull Request generation');

  // 6. Session and Activities Retrieval via CodingAgentManager
  const session = await codingAgentManager.getSession(mockResult.sessionId, 'mock');
  assert.strictEqual(session.id, mockResult.sessionId);
  assert.strictEqual(session.state, 'COMPLETED');

  const activities = await codingAgentManager.listActivities(mockResult.sessionId, 'mock');
  assert.strictEqual(activities.length, mockResult.activities.length);
  console.log('✅ PASS: Session and activity retrieval verified through CodingAgentManager');

  console.log('✅ Jules & CodingAgentManager Unit Tests Passed');
}
