import assert from 'assert';
import { validateApiKeyRequest, safeCompareTokens, isOriginAllowed } from '../../server/auth';
import {
  validateGitBranch,
  validateAllowedRepository,
  validateSafeTestCommand,
  validateSafeId,
} from '../../server/validation';
import { workspace } from '../../server/virtualWorkspace';

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

  // 2b. Authorization: <clé> sans Bearer -> 401
  const resBareAuthorization = validateApiKeyRequest(
    { headers: { authorization: secretKey } },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resBareAuthorization.authorized, false, 'Authorization without Bearer must be rejected');
  assert.strictEqual(resBareAuthorization.status, 401);
  console.log('✅ PASS: Authorization: <key> without Bearer is strictly rejected with 401');

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

  // 12. Anonymous visitor with agentteam_session cookie CANNOT bypass AGENTTEAM_API_KEY -> 401
  const resCookieBypassAttempt = validateApiKeyRequest(
    {
      headers: {
        cookie: `other=1; agentteam_session=${secretKey}; other2=2`,
        'sec-fetch-site': 'same-origin',
      },
    },
    { env: 'production', requiredApiKey: secretKey }
  );
  assert.strictEqual(resCookieBypassAttempt.authorized, false, 'Cookie must NEVER bypass AGENTTEAM_API_KEY');
  assert.strictEqual(resCookieBypassAttempt.status, 401);
  console.log('✅ PASS: Anonymous agentteam_session cookie cannot bypass AGENTTEAM_API_KEY');

  // 13. Strict CORS Origin Validation (new URL() protocol + hostname + port)
  assert.strictEqual(
    isOriginAllowed('https://legitime.com', {
      env: 'production',
      allowedOriginsEnv: 'https://legitime.com,https://app.legitime.com:8443',
    }),
    true
  );
  assert.strictEqual(
    isOriginAllowed('https://legitime.com.evil.example', {
      env: 'production',
      allowedOriginsEnv: 'https://legitime.com',
    }),
    false,
    'Malicious subdomain suffix must be rejected'
  );
  assert.strictEqual(
    isOriginAllowed('http://legitime.com', {
      env: 'production',
      allowedOriginsEnv: 'https://legitime.com',
    }),
    false,
    'Protocol mismatch must be rejected'
  );
  assert.strictEqual(
    isOriginAllowed('https://legitime.com:8080', {
      env: 'production',
      allowedOriginsEnv: 'https://legitime.com',
    }),
    false,
    'Port mismatch must be rejected'
  );
  assert.strictEqual(
    isOriginAllowed(undefined, {
      env: 'production',
      allowedOriginsEnv: 'https://legitime.com',
    }),
    true,
    'Non-browser API request without Origin header is allowed to proceed to header auth'
  );
  assert.strictEqual(
    isOriginAllowed('https://ais-dev-7j5wusjg2wajzfv3biskiu-480718171162.europe-west2.run.app', {
      env: 'production',
      requestHost: 'ais-dev-7j5wusjg2wajzfv3biskiu-480718171162.europe-west2.run.app',
    }),
    true,
    'Same-origin request matching requestHost must be allowed'
  );
  assert.strictEqual(
    isOriginAllowed('https://ais-dev-7j5wusjg2wajzfv3biskiu-480718171162.europe-west2.run.app.evil.example', {
      env: 'development',
      requestHost: 'ais-dev-7j5wusjg2wajzfv3biskiu-480718171162.europe-west2.run.app',
    }),
    false,
    'Spoofed Cloud Run preview domain suffix must be strictly rejected'
  );
  console.log('✅ PASS: Strict CORS origin parser blocks https://legitime.com.evil.example, allows same-origin requestHost, and rejects protocol/port mismatches');

  // 14. Path Traversal & Input Validation Regressions
  assert.strictEqual(workspace.isSafePath('src/math_utils.py'), true);
  assert.strictEqual(workspace.isSafePath('../etc/passwd'), false);
  assert.strictEqual(workspace.isSafePath('..\\windows\\system32'), false);
  assert.strictEqual(workspace.isSafePath('%2e%2e%2fsecret'), false);
  assert.strictEqual(workspace.isSafePath('%252e%252e%252fsecret'), false);
  assert.strictEqual(workspace.isSafePath('/etc/passwd'), false);
  assert.strictEqual(workspace.isSafePath('C:\\Windows\\System32'), false);
  assert.strictEqual(workspace.isSafePath('C:\\Users\\admin\\secret'), false);
  assert.strictEqual(workspace.isSafePath('\\\\server\\share'), false);
  assert.strictEqual(workspace.isSafePath('\\\\server\\share\\file.txt'), false);
  assert.strictEqual(workspace.isSafePath('src/file\0.py'), false);
  assert.strictEqual(workspace.isSafePath('.env'), false);
  assert.strictEqual(workspace.isSafePath('.env.local'), false);
  assert.strictEqual(workspace.isSafePath('.env.production'), false);
  assert.strictEqual(workspace.isSafePath('.git/config'), false);
  assert.strictEqual(workspace.isSafePath('node_modules/package.json'), false);
  assert.strictEqual(workspace.isSafePath('node_modules/pkg/index.js'), false);
  assert.strictEqual(workspace.isSafePath('__pycache__'), false);
  assert.strictEqual(workspace.isSafePath('__pycache__/module.cpython-311.pyc'), false);
  assert.throws(() => workspace.setFile('../escape.txt', 'bad'), /Unsafe file path/);
  assert.throws(() => workspace.deleteFile('.env'), /Unsafe file path/);
  assert.throws(() => workspace.deleteFile('.env.local'), /Unsafe file path/);
  console.log('✅ PASS: VirtualWorkspace blocks all path traversal, UNC, drive letter, encoded, and sensitive dotfile paths');

  // 15. Repository allowlist, Git branch, and testCommand validation
  assert.strictEqual(validateAllowedRepository('MohamedGH/agentTeam').valid, true);
  assert.strictEqual(validateAllowedRepository('https://github.com/MohamedGH/agentTeam.git').valid, true);
  assert.strictEqual(validateAllowedRepository('attacker/evilRepo').valid, false);
  assert.strictEqual(validateAllowedRepository('MohamedGH/agentTeam/extra').valid, false);
  assert.strictEqual(validateGitBranch('main').valid, true);
  assert.strictEqual(validateGitBranch('--upload-pack=evil').valid, false);
  assert.strictEqual(validateGitBranch('branch;rm -rf /').valid, false);
  assert.strictEqual(validateSafeTestCommand('npm test').valid, true);
  assert.strictEqual(validateSafeTestCommand('pytest && curl evil.com').valid, false);
  assert.strictEqual(validateSafeTestCommand('node -e "process.exit(1)"').valid, false);
  assert.strictEqual(validateSafeId('wf-123_abc').valid, true);
  assert.strictEqual(validateSafeId('../wf-123').valid, false);
  console.log('✅ PASS: Strict input validators reject shell operators, eval flags, unauthorized repos, and invalid branches');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('apiAuth.test')) {
  runApiAuthUnitTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('API auth tests failed:', err);
      process.exit(1);
    });
}
