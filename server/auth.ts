import express from 'express';
import crypto from 'crypto';

/**
 * Timing-safe token comparison to prevent timing side-channel attacks
 */
export function safeCompareTokens(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Utility to parse Cookie header into key-value map
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, str) => {
    const [k, v] = str.trim().split('=');
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {} as Record<string, string>);
}

export interface AuthValidationResult {
  authorized: boolean;
  status?: number;
  error?: string;
}

/**
 * Validates request authorization using AGENTTEAM_API_KEY with fail-closed semantics.
 * - API keys in URL query parameters are FORBIDDEN (returns 401).
 * - Supported headers: 'X-API-Key: <key>' or 'Authorization: Bearer <key>'.
 * - First-party Web UI sessions (via SameSite HttpOnly cookie) are authorized without exposing keys to browser.
 * - In production, missing AGENTTEAM_API_KEY returns 403 fail-closed.
 */
export function validateApiKeyRequest(
  req: {
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, any>;
  },
  options: {
    env?: string;
    requiredApiKey?: string;
    webSessionSecret?: string;
  }
): AuthValidationResult {
  const env = options.env || process.env.NODE_ENV || 'development';
  const requiredApiKey = options.requiredApiKey ?? process.env.AGENTTEAM_API_KEY;

  // 1. Explicitly reject any attempt to pass API keys via query string parameters
  if (req.query && (req.query.apiKey !== undefined || req.query.api_key !== undefined || req.query.token !== undefined)) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: API keys in URL query parameters are forbidden. Use X-API-Key or Authorization header.',
    };
  }

  // 2. If no AGENTTEAM_API_KEY is configured
  if (!requiredApiKey) {
    if (env === 'production') {
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: AGENTTEAM_API_KEY must be configured in production environment',
      };
    }
    return { authorized: true };
  }

  // 3. Extract tokens from headers ONLY (never query)
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  let headerToken: string | undefined = undefined;
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    headerToken = apiKeyHeader.trim();
  } else if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      headerToken = authHeader.slice(7).trim();
    } else {
      headerToken = authHeader.trim();
    }
  }

  if (headerToken) {
    if (safeCompareTokens(headerToken, requiredApiKey)) {
      return { authorized: true };
    }
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Invalid AGENTTEAM_API_KEY',
    };
  }

  // 4. Server-side session verification for first-party Web UI (zero secret exposure to client)
  if (options.webSessionSecret) {
    const rawCookie = typeof req.headers['cookie'] === 'string' ? req.headers['cookie'] : undefined;
    const cookies = parseCookies(rawCookie);
    const sessionCookie = cookies['agentteam_session'];
    const secFetchSite = req.headers['sec-fetch-site'];
    const origin = req.headers['origin'];
    const host = req.headers['host'];

    const isSameOrigin =
      secFetchSite === 'same-origin' ||
      !origin ||
      (typeof origin === 'string' && typeof host === 'string' && (origin.includes(host) || origin.endsWith(host)));

    if (sessionCookie && safeCompareTokens(sessionCookie, options.webSessionSecret) && isSameOrigin) {
      return { authorized: true };
    }
  }

  // 5. Fail-closed: No valid API key header and no valid session
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Valid AGENTTEAM_API_KEY is required',
  };
}

/**
 * Express middleware factory for AGENTTEAM_API_KEY protection
 */
export function createRequireApiKeyMiddleware(webSessionSecret?: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = validateApiKeyRequest(req, {
      env: process.env.NODE_ENV,
      requiredApiKey: process.env.AGENTTEAM_API_KEY,
      webSessionSecret,
    });

    if (!result.authorized) {
      return res.status(result.status || 401).json({ error: result.error });
    }
    next();
  };
}
