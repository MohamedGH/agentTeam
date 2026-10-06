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
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return cookieHeader.split(';').reduce((acc, str) => {
    const idx = str.indexOf('=');
    if (idx > 0) {
      const k = str.slice(0, idx).trim();
      const v = str.slice(idx + 1).trim();
      if (k && v) {
        try {
          acc[k] = decodeURIComponent(v);
        } catch {
          acc[k] = v;
        }
      }
    }
    return acc;
  }, {} as Record<string, string>);
}

export interface OriginValidationOptions {
  env?: string;
  allowedOriginsEnv?: string;
  allowedOrigins?: string[];
  requestHost?: string;
}

/**
 * Strict CORS Origin validator using URL parsing.
 * - Never uses substring matching (.includes() / .endsWith()).
 * - Rejects wildcards ('*') when credentials are enabled.
 * - Compares protocol + hostname + port strictly.
 * - Permits same-origin requests where parsed Origin host strictly equals the request Host header.
 * - In production, only explicitly configured ALLOWED_ORIGINS (or same-origin requestHost) are permitted.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOriginsOrOptions: string[] | OriginValidationOptions = {},
  envArg?: string
): boolean {
  // Requests without Origin header (e.g., CLI/API clients with X-API-Key/Bearer or same-origin GET)
  if (!origin) {
    return true;
  }

  if (typeof origin !== 'string' || origin === 'null' || origin.trim() === '*') {
    return false;
  }

  let env = envArg || process.env.NODE_ENV || 'development';
  let allowedOrigins: string[] = [];
  let requestHost: string | undefined;

  if (Array.isArray(allowedOriginsOrOptions)) {
    allowedOrigins = allowedOriginsOrOptions;
  } else if (allowedOriginsOrOptions && typeof allowedOriginsOrOptions === 'object') {
    if (allowedOriginsOrOptions.env) {
      env = allowedOriginsOrOptions.env;
    }
    if (typeof allowedOriginsOrOptions.requestHost === 'string') {
      requestHost = allowedOriginsOrOptions.requestHost.split(',')[0].trim();
    }
    if (Array.isArray(allowedOriginsOrOptions.allowedOrigins)) {
      allowedOrigins = allowedOriginsOrOptions.allowedOrigins;
    } else if (typeof allowedOriginsOrOptions.allowedOriginsEnv === 'string') {
      allowedOrigins = allowedOriginsOrOptions.allowedOriginsEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return false;
  }

  // Ensure origin string does not carry path, query, hash, or credentials
  if (parsedOrigin.origin !== origin) {
    return false;
  }

  // Allow same-origin requests where the Origin's host (hostname[:port]) strictly equals the target Host header
  if (requestHost && /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(requestHost)) {
    if (parsedOrigin.host.toLowerCase() === requestHost.toLowerCase()) {
      return true;
    }
  }

  for (const allowed of allowedOrigins) {
    const trimmed = (allowed || '').trim();
    if (!trimmed || trimmed === '*') continue;
    try {
      const parsedAllowed = new URL(trimmed);
      if (
        parsedOrigin.protocol === parsedAllowed.protocol &&
        parsedOrigin.hostname.toLowerCase() === parsedAllowed.hostname.toLowerCase() &&
        parsedOrigin.port === parsedAllowed.port
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  // In non-production, allow strict localhost / 127.0.0.1 and AI Studio Cloud Run preview origins (parsed via URL)
  if (env !== 'production') {
    const host = parsedOrigin.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
    if (
      parsedOrigin.protocol === 'https:' &&
      parsedOrigin.port === '' &&
      /^ais-(?:dev|pre)-[a-z0-9-]+-\d+\.[a-z0-9-]+\.run\.app$/.test(host)
    ) {
      return true;
    }
  }

  return false;
}

export interface AuthValidationResult {
  authorized: boolean;
  status?: number;
  error?: string;
}

/**
 * Validates request authorization using AGENTTEAM_API_KEY with fail-closed semantics.
 * - API keys in URL query parameters (?apiKey=, ?api_key=, ?token=) are STRICTLY FORBIDDEN (returns 401),
 *   even if a valid header is also present.
 * - Only 'X-API-Key: <key>' or 'Authorization: Bearer <key>' headers are accepted.
 * - 'Authorization: <key>' without 'Bearer ' prefix is rejected with 401.
 * - Anonymous visitors never receive privileged session cookies or bypasses.
 * - In production, missing AGENTTEAM_API_KEY returns 403 fail-closed.
 */
export function validateApiKeyRequest(
  req: {
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, any>;
    url?: string;
    originalUrl?: string;
  },
  options: {
    env?: string;
    requiredApiKey?: string;
  } = {}
): AuthValidationResult {
  const env = options.env || process.env.NODE_ENV || 'development';
  const requiredApiKey = options.requiredApiKey ?? process.env.AGENTTEAM_API_KEY;

  // 1. Explicitly reject any attempt to pass API keys via query string parameters
  const hasForbiddenQueryObj = Boolean(
    req.query &&
      (req.query.apiKey !== undefined ||
        req.query.api_key !== undefined ||
        req.query.token !== undefined)
  );

  const rawUrl = req.originalUrl || req.url || '';
  const queryPart = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
  const hasForbiddenRawQuery = /(?:^|&)(?:apiKey|api_key|token)(?:=|$)/i.test(queryPart);

  if (hasForbiddenQueryObj || hasForbiddenRawQuery) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: API keys in URL query parameters are forbidden. Use X-API-Key or Authorization: Bearer header.',
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

  // 3. Extract tokens strictly from 'X-API-Key' or 'Authorization: Bearer <key>'
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  if (Array.isArray(apiKeyHeader) || Array.isArray(authHeader)) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Multiple authentication headers are not allowed',
    };
  }

  let headerToken: string | undefined = undefined;

  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim().length > 0) {
    headerToken = apiKeyHeader.trim();
  } else if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const trimmedAuth = authHeader.trim();
    if (!trimmedAuth.startsWith('Bearer ')) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Authorization header must use the Bearer scheme (Authorization: Bearer <key>)',
      };
    }
    headerToken = trimmedAuth.slice(7).trim();
    if (!headerToken) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Bearer token cannot be empty',
      };
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

  // 4. Fail-closed: No valid API key header provided
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Valid AGENTTEAM_API_KEY is required',
  };
}

/**
 * Express middleware factory for AGENTTEAM_API_KEY protection
 */
export function createRequireApiKeyMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = validateApiKeyRequest(req, {
      env: process.env.NODE_ENV,
      requiredApiKey: process.env.AGENTTEAM_API_KEY,
    });

    if (!result.authorized) {
      return res.status(result.status || 401).json({ error: result.error });
    }
    next();
  };
}
