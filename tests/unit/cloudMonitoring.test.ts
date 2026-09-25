import { cloudMonitoringQuotaService } from '../../server/cloudMonitoring';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

export async function runCloudMonitoringUnitTests() {
  console.log('\n--- [Unit Test] Google Cloud Monitoring & Dynamic Project ID ---');

  // 1. Verify Project ID is NOT hardcoded
  const savedGcpId = process.env.GCP_PROJECT_ID;
  const savedGoogleProject = process.env.GOOGLE_CLOUD_PROJECT;
  const savedGcloudProject = process.env.GCLOUD_PROJECT;
  const savedProjectId = process.env.PROJECT_ID;

  delete process.env.GCP_PROJECT_ID;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GCLOUD_PROJECT;
  delete process.env.PROJECT_ID;

  assert(
    cloudMonitoringQuotaService.getProjectId() === null,
    'getProjectId returns null when no env vars are set (NO HARDCODED PROJECT ID)'
  );

  // Set dynamic env var
  process.env.GCP_PROJECT_ID = 'test-dynamic-project-xyz';
  assert(
    cloudMonitoringQuotaService.getProjectId() === 'test-dynamic-project-xyz',
    'getProjectId dynamically resolves GCP_PROJECT_ID'
  );

  delete process.env.GCP_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = 'test-gcp-999';
  assert(
    cloudMonitoringQuotaService.getProjectId() === 'test-gcp-999',
    'getProjectId dynamically resolves GOOGLE_CLOUD_PROJECT'
  );

  // Restore env
  if (savedGcpId) process.env.GCP_PROJECT_ID = savedGcpId;
  else delete process.env.GCP_PROJECT_ID;
  if (savedGoogleProject) process.env.GOOGLE_CLOUD_PROJECT = savedGoogleProject;
  else delete process.env.GOOGLE_CLOUD_PROJECT;
  if (savedGcloudProject) process.env.GCLOUD_PROJECT = savedGcloudProject;
  else delete process.env.GCLOUD_PROJECT;
  if (savedProjectId) process.env.PROJECT_ID = savedProjectId;
  else delete process.env.PROJECT_ID;

  // 2. Authoritative Quota Metric parsing from quota descriptor (never fake guessing)
  const parsed = cloudMonitoringQuotaService.parseAuthoritativeServiceUsageQuota();
  assert(parsed !== null && typeof parsed === 'object', 'parseAuthoritativeServiceUsageQuota parses models');

  // 3. 60-Second Strict Caching Verification
  cloudMonitoringQuotaService.invalidateCache();
  const res1 = await cloudMonitoringQuotaService.fetchRealQuotaMetrics();
  assert(res1 !== null, 'fetchRealQuotaMetrics returned result');
  assert(res1.lastFetchedAt > 0, 'lastFetchedAt is timestamped');
  assert(res1.expiresAt === res1.lastFetchedAt + 60000, 'expiresAt is exactly +60000ms (60-second TTL)');

  const cacheStatus = cloudMonitoringQuotaService.getCacheStatus();
  assert(cacheStatus.isCached === true, 'Cache is active');
  assert(cacheStatus.ttlRemainingSeconds <= 60 && cacheStatus.ttlRemainingSeconds >= 0, 'TTL remaining is within 60s');

  const res2 = await cloudMonitoringQuotaService.fetchRealQuotaMetrics();
  assert(res2.lastFetchedAt === res1.lastFetchedAt, 'Cached result returned without redundant network refetch');

  console.log('✅ CloudMonitoring Unit Tests Passed');
}
