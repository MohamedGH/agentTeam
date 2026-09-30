import assert from 'assert';
import { validateApiKeyRequest, safeCompareTokens, parseCookies } from '../../server/auth';

export async function runApiAuthUnitTests() {
  console.log('\n--- [Unit Test] API Authentication & URL Query Protection ---');

  const secretKey = 'super-secret-production-agentteam-key-999';

  // 1. X-API-Key valide -> 200 / authorized
  const resValidXApiKey = validateApiKeyRequest(
    { headers: { 'x-api-key': secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resValidXApiKey.authorized, true, 'Valid X-API-Key must be authorized');
  console.log('✅ PASS: Valid X-API-Key is authorized');

  // 2. Authorization: Bearer valide -> 200 / authorized
  const resValidBearer = validateApiKeyRequest(
    { headers: { authorization: `Bearer ${secretKey}` } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resValidBearer.authorized, true, 'Valid Bearer token must be authorized');
  console.log('✅ PASS: Valid Authorization: Bearer is authorized');

  // 3. Clé incorrecte -> 401
  const resInvalidKey = validateApiKeyRequest(
    { headers: { 'x-api-key': 'wrong-key-attempt' } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resInvalidKey.authorized, false);
  assert.strictEqual(resInvalidKey.status, 401);
  assert.strictEqual(resInvalidKey.error?.includes(secretKey), false, 'Error message must NEVER leak the secret key');
  console.log('✅ PASS: Invalid key is rejected with 401 without leaking secret in message');

  // 4. Clé absente -> 401
  const resMissingKey = validateApiKeyRequest(
    { headers: {} },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resMissingKey.authorized, false);
  assert.strictEqual(resMissingKey.status, 401);
  console.log('✅ PASS: Missing key is rejected with 401');

  // 5. ?apiKey=... -> Refusé (401)
  const resQueryApiKey = validateApiKeyRequest(
    { headers: {}, query: { apiKey: secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resQueryApiKey.authorized, false);
  assert.strictEqual(resQueryApiKey.status, 401);
  assert.strictEqual(resQueryApiKey.error?.includes('forbidden'), true);
  console.log('✅ PASS: ?apiKey=... in URL is strictly refused with 401');

  // 6. ?api_key=... -> Refusé (401)
  const resQueryApiKeySnake = validateApiKeyRequest(
    { headers: {}, query: { api_key: secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resQueryApiKeySnake.authorized, false);
  assert.strictEqual(resQueryApiKeySnake.status, 401);
  console.log('✅ PASS: ?api_key=... in URL is strictly refused with 401');

  // 7. ?token=... -> Refusé (401)
  const resQueryToken = validateApiKeyRequest(
    { headers: {}, query: { token: secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resQueryToken.authorized, false);
  assert.strictEqual(resQueryToken.status, 401);
  console.log('✅ PASS: ?token=... in URL is strictly refused with 401');

  // 8. ?apiKey even if valid header present -> Refusé (401) to eliminate URL leak vectors
  const resBothHeaderAndQuery = validateApiKeyRequest(
    { headers: { 'x-api-key': secretKey }, query: { apiKey: secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resBothHeaderAndQuery.authorized, false);
  assert.strictEqual(resBothHeaderAndQuery.status, 401);
  console.log('✅ PASS: Request with URL query key is refused even if header is also passed');

  // 9. Production fail-closed without AGENTTEAM_API_KEY -> 403
  const resProdNoKey = validateApiKeyRequest(
    { headers: {} },
    { env: 'production', requiredApiKey: undefined }
  );
  assert.strictEqual(resProdNoKey.authorized, false);
  assert.strictEqual(resProdNoKey.status, 403);
  console.log('✅ PASS: Production without AGENTTEAM_API_KEY returns 403 fail-closed');

  // 10. Development without AGENTTEAM_API_KEY -> authorized
  const resDevNoKey = validateApiKeyRequest(
    { headers: {} },
    { env: 'development', requiredApiKey: undefined }
  );
  assert.strictEqual(resDevNoKey.authorized, true);
  console.log('✅ PASS: Development without AGENTTEAM_API_KEY is allowed for local dev');

  // 11. Timing-safe comparison invariant
  assert.strictEqual(safeCompareTokens('same-string-123', 'same-string-123'), true);
  assert.strictEqual(safeCompareTokens('short', 'longer-string'), false);
  assert.strictEqual(safeCompareTokens('abc', 'abd'), false);
  console.log('✅ PASS: Timing-safe token comparison validates accurately');

  // 12. Server-side session verification for first-party Web UI (zero secret exposure to client)
  const webSessionSecret = 'random-session-secret-xyz';
  const resWebUiSession = validateApiKeyRequest(
    {
      headers: {
        cookie: `other=1; agentteam_session=${webSessionSecret}; other2=2`,
        'sec-fetch-site': 'same-origin',
      },
    },
    { env: 'production', requiredApiKey: secretKey, webSessionSecret }
  );
  assert.strictEqual(resWebUiSession.authorized, true);
  console.log('✅ PASS: First-party Web UI with HttpOnly session cookie is authorized without exposing API key');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('apiAuth.test')) {
  runApiAuthUnitTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('API auth tests failed:', err);
      process.exit(1);
    });
}
