import {
  AIProviderId,
  ProviderErrorReason,
  ClassifiedProviderError,
  FailoverRecord,
} from './types';

export type { ProviderErrorReason, ClassifiedProviderError, FailoverRecord };

/**
 * Sanitizes an error message or string by stripping out sensitive secrets,
 * API keys, authorization headers, and Bearer tokens.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'Unknown provider error';
  }

  return rawMessage
    // Redact Google Gemini API keys (AIzaSy...)
    .replace(/AIza[0-9A-Za-z-_]{10,}/g, 'AIza...[REDACTED_API_KEY]')
    // Redact Anthropic API keys (sk-ant-...)
    .replace(/sk-ant-[0-9a-zA-Z-_]{5,}/g, 'sk-ant-...[REDACTED_API_KEY]')
    // Redact Groq API keys (gsk_...)
    .replace(/gsk_[0-9a-zA-Z-_]{5,}/g, 'gsk_...[REDACTED_API_KEY]')
    // Redact OpenAI API keys (sk-...)
    .replace(/sk-[0-9a-zA-Z-_]{10,}/g, 'sk-...[REDACTED_API_KEY]')
    // Redact Authorization Bearer headers
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    // Redact query parameter keys: ?key=... or &key=...
    .replace(/([?&](?:key|api[_-]?key|token)=)[^&\s]+/gi, '$1[REDACTED_KEY]')
    // Redact JSON/header authorization fields
    .replace(/(authorization["']?\s*:\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]')
    // Redact generic secrets or passwords
    .replace(/((?:secret|password|client_secret)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]');
}

/**
 * Extracts Retry-After delay in seconds from error headers, response metadata, or message.
 */
export function extractRetryAfter(error: any): number | undefined {
  if (!error) return undefined;

  // 1. Check HTTP response headers
  const headers =
    error.headers ||
    error.response?.headers ||
    error.response?.header ||
    (typeof error.response?.headers?.get === 'function' ? error.response.headers : null);

  if (headers) {
    let retryVal: any = null;
    if (typeof headers.get === 'function') {
      retryVal = headers.get('retry-after') || headers.get('Retry-After');
    } else if (typeof headers === 'object') {
      retryVal = headers['retry-after'] || headers['Retry-After'] || headers['retry_after'];
    }

    if (retryVal !== null && retryVal !== undefined) {
      // Could be integer seconds (e.g. "30") or HTTP date
      const numeric = Number(retryVal);
      if (!isNaN(numeric) && numeric > 0) {
        return Math.ceil(numeric);
      }
      const parsedDate = Date.parse(String(retryVal));
      if (!isNaN(parsedDate)) {
        const diffSec = Math.ceil((parsedDate - Date.now()) / 1000);
        return diffSec > 0 ? diffSec : undefined;
      }
    }

    // Check retry-after-ms
    let retryMs: any = null;
    if (typeof headers.get === 'function') {
      retryMs = headers.get('retry-after-ms') || headers.get('Retry-After-Ms');
    } else if (typeof headers === 'object') {
      retryMs = headers['retry-after-ms'] || headers['Retry-After-Ms'];
    }
    if (retryMs !== null && retryMs !== undefined) {
      const ms = Number(retryMs);
      if (!isNaN(ms) && ms > 0) {
        return Math.ceil(ms / 1000);
      }
    }
  }

  // 2. Check Google RPC / gRPC details array for RetryInfo
  if (Array.isArray(error.details)) {
    for (const d of error.details) {
      if (d && (d['@type']?.includes('RetryInfo') || d.retryDelay)) {
        const delayStr = d.retryDelay?.seconds || d.retryDelay;
        const num = Number(delayStr);
        if (!isNaN(num) && num > 0) {
          return Math.ceil(num);
        }
      }
    }
  }

  // 3. Inspect error metadata or error object directly
  if (error.retryAfter || error.retry_after) {
    const num = Number(error.retryAfter || error.retry_after);
    if (!isNaN(num) && num > 0) return Math.ceil(num);
  }

  // 4. Regex inspect in error message: "retry after X seconds", "try again in Xs"
  const rawMsg = String(error?.message || error || '');
  const matchSec = rawMsg.match(/retry\s+after\s+(\d+)\s*(?:s|seconds?)/i) ||
    rawMsg.match(/try\s+again\s+in\s+([\d.]+)\s*(?:s|seconds?)/i) ||
    rawMsg.match(/rate\s+limit\s+reset\s+in\s+(\d+)\s*s/i);

  if (matchSec && matchSec[1]) {
    const parsed = Math.ceil(Number(matchSec[1]));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

/**
 * Robust Centralized Provider Error Classifier.
 *
 * Inspects:
 * - HTTP status (status, statusCode, response.status)
 * - Error code (code, error.code, status text)
 * - Error name (name, constructor name)
 * - Response metadata & headers
 * - Error cause chain
 * - Provider-specific payloads (Google GenAI, OpenAI, Anthropic, Groq, DeepSeek)
 *
 * Distinct state classification:
 * - RATE_LIMIT
 * - QUOTA
 * - HIGH_DEMAND
 * - TEMPORARY_UNAVAILABLE
 * - MODEL_EXECUTION_ERROR
 * - AUTHENTICATION
 * - INVALID_REQUEST
 * - CONFIGURATION
 * - UNKNOWN
 */
export function classifyProviderError(error: unknown): ClassifiedProviderError {
  if (!error) {
    return {
      retryable: false,
      reason: 'UNKNOWN',
      sanitizedMessage: 'Unknown empty error',
    };
  }

  const errObj = typeof error === 'object' ? (error as Record<string, any>) : {};
  const rawMessage = String(errObj.message || error || '');
  const sanitized = sanitizeErrorMessage(rawMessage);
  const lowerMsg = rawMessage.toLowerCase();

  // 1. Extract HTTP Status Code
  let statusCode: number | undefined =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : typeof errObj.status_code === 'number'
      ? errObj.status_code
      : typeof errObj.response?.status === 'number'
      ? errObj.response.status
      : typeof errObj.httpStatus === 'number'
      ? errObj.httpStatus
      : undefined;

  if (!statusCode) {
    const statusMatch = rawMessage.match(/\b(400|401|403|404|408|429|500|502|503|504)\b/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
    }
  }

  // 2. Extract Error Code and Error Name
  const errorCode = String(
    errObj.code ||
    errObj.error?.code ||
    errObj.status ||
    errObj.codeName ||
    ''
  ).toUpperCase();

  const errorName = String(
    errObj.name ||
    errObj.error?.type ||
    errObj.constructor?.name ||
    ''
  );

  // 3. Extract Retry-After if available
  const retryAfterSeconds = extractRetryAfter(error);

  // 4. Cause chain traversal if available
  const causeMsg = errObj.cause ? String(errObj.cause?.message || errObj.cause).toLowerCase() : '';
  const combinedText = `${lowerMsg} ${causeMsg} ${errorName.toLowerCase()} ${errorCode.toLowerCase()}`;

  // =========================================================================
  // REQUIREMENT 2: SPECIFIC AI STUDIO RETRYABLE CASE
  // "Encountered retryable error from model provider: Agent execution terminated due to error."
  // or "Agent execution terminated due to error" from model provider.
  // =========================================================================
  if (
    lowerMsg.includes('agent execution terminated due to error') ||
    causeMsg.includes('agent execution terminated due to error')
  ) {
    return {
      retryable: true,
      reason: 'MODEL_EXECUTION_ERROR',
      statusCode,
      errorCode: errorCode || 'MODEL_EXECUTION_ERROR',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 15,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // AUTHENTICATION (Non-retryable across same provider)
  // HTTP 401 or explicit credentials/auth failure
  // =========================================================================
  if (
    statusCode === 401 ||
    errorCode === 'UNAUTHENTICATED' ||
    errorCode === 'INVALID_API_KEY' ||
    errorName === 'AuthenticationError' ||
    combinedText.includes('invalid_api_key') ||
    combinedText.includes('invalid api key') ||
    combinedText.includes('unauthorized') ||
    combinedText.includes('authentication failed') ||
    combinedText.includes('unauthenticated') ||
    combinedText.includes('incorrect api key')
  ) {
    return {
      retryable: false,
      reason: 'AUTHENTICATION',
      statusCode: statusCode || 401,
      errorCode: errorCode || 'AUTHENTICATION_FAILED',
      errorName,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // CONFIGURATION (Non-retryable across same provider)
  // HTTP 403 (when not quota), API not enabled, billing disabled, model not found
  // =========================================================================
  if (
    (statusCode === 403 && !combinedText.includes('quota')) ||
    statusCode === 404 ||
    errorCode === 'NOT_FOUND' ||
    errorCode === 'PERMISSION_DENIED' ||
    errorName === 'NotFoundError' ||
    errorName === 'PermissionDeniedError' ||
    combinedText.includes('model not found') ||
    combinedText.includes('model_not_found') ||
    combinedText.includes('unsupported model') ||
    combinedText.includes('api has not been used') ||
    combinedText.includes('has not enabled') ||
    combinedText.includes('api is not enabled') ||
    combinedText.includes('forbidden') ||
    combinedText.includes('access not configured') ||
    combinedText.includes('project not found') ||
    combinedText.includes('missing api key')
  ) {
    return {
      retryable: false,
      reason: 'CONFIGURATION',
      statusCode: statusCode || (errorCode === 'NOT_FOUND' ? 404 : 403),
      errorCode: errorCode || (statusCode === 404 ? 'NOT_FOUND' : 'PERMISSION_DENIED'),
      errorName,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // QUOTA EXHAUSTION (Retryable failover to alternative provider/model)
  // HTTP 429 / RESOURCE_EXHAUSTED with quota / billing context
  // =========================================================================
  if (
    errorCode === 'INSUFFICIENT_QUOTA' ||
    combinedText.includes('insufficient_quota') ||
    combinedText.includes('exceeded your current quota') ||
    combinedText.includes('quota exceeded') ||
    combinedText.includes('quota limit') ||
    combinedText.includes('quota') ||
    combinedText.includes('check your plan and billing') ||
    combinedText.includes('daily request limit') ||
    combinedText.includes('free_tier_requests_per_day') ||
    combinedText.includes('requests_per_day') ||
    (statusCode === 429 && combinedText.includes('quota'))
  ) {
    return {
      retryable: true,
      reason: 'QUOTA',
      statusCode: statusCode || 429,
      errorCode: errorCode || 'QUOTA_EXHAUSTED',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 120, // Quotas take longer to reset
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // RATE LIMIT (Retryable with cooldown or failover)
  // HTTP 429, RESOURCE_EXHAUSTED, TPM/RPM limits
  // =========================================================================
  if (
    statusCode === 429 ||
    errorCode === 'RESOURCE_EXHAUSTED' ||
    errorCode === 'RATE_LIMIT_EXCEEDED' ||
    errorName === 'RateLimitError' ||
    combinedText.includes('rate limit') ||
    combinedText.includes('rate_limit') ||
    combinedText.includes('too many requests') ||
    combinedText.includes('requests per minute') ||
    combinedText.includes('tokens per minute') ||
    combinedText.includes('tpm') ||
    combinedText.includes('rpm')
  ) {
    return {
      retryable: true,
      reason: 'RATE_LIMIT',
      statusCode: statusCode || 429,
      errorCode: errorCode || 'RESOURCE_EXHAUSTED',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 60,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // HIGH DEMAND (Retryable failover)
  // HTTP 503 with high demand / temporary spike / overloaded
  // =========================================================================
  if (
    (statusCode === 503 && (combinedText.includes('high demand') || combinedText.includes('overloaded') || combinedText.includes('capacity'))) ||
    combinedText.includes('high demand') ||
    combinedText.includes('spikes in demand') ||
    combinedText.includes('model is overloaded') ||
    combinedText.includes('overloaded') ||
    combinedText.includes('overloaded_error') ||
    errorName === 'OverloadedError'
  ) {
    return {
      retryable: true,
      reason: 'HIGH_DEMAND',
      statusCode: statusCode || 503,
      errorCode: errorCode || 'UNAVAILABLE_HIGH_DEMAND',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 30,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // TEMPORARY UNAVAILABLE (Retryable failover)
  // HTTP 500, 502, 503, 504, UNAVAILABLE, ETIMEDOUT, ECONNRESET, ENOTFOUND
  // =========================================================================
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504 ||
    statusCode === 500 ||
    errorCode === 'UNAVAILABLE' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    errorName === 'APIConnectionError' ||
    combinedText.includes('service unavailable') ||
    combinedText.includes('bad gateway') ||
    combinedText.includes('gateway timeout') ||
    combinedText.includes('connection reset') ||
    combinedText.includes('network timeout') ||
    combinedText.includes('temporarily unavailable') ||
    combinedText.includes('internal error')
  ) {
    return {
      retryable: true,
      reason: 'TEMPORARY_UNAVAILABLE',
      statusCode: statusCode || 503,
      errorCode: errorCode || 'TEMPORARY_UNAVAILABLE',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 20,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // MODEL EXECUTION ERROR (Retryable)
  // Runtime generation/decoding errors that can succeed on another model
  // =========================================================================
  if (
    combinedText.includes('model execution error') ||
    combinedText.includes('failed to generate content') ||
    combinedText.includes('model output generation failed') ||
    combinedText.includes('generation stopped unexpectedly') ||
    combinedText.includes('internal model error')
  ) {
    return {
      retryable: true,
      reason: 'MODEL_EXECUTION_ERROR',
      statusCode,
      errorCode: errorCode || 'MODEL_EXECUTION_ERROR',
      errorName,
      retryAfterSeconds: retryAfterSeconds || 15,
      sanitizedMessage: sanitized,
    };
  }

  // =========================================================================
  // INVALID REQUEST (Non-retryable unless model-specific like context length)
  // HTTP 400, context length exceeded, invalid prompt structure
  // =========================================================================
  if (
    statusCode === 400 ||
    errorCode === 'INVALID_ARGUMENT' ||
    errorName === 'BadRequestError' ||
    combinedText.includes('invalid argument') ||
    combinedText.includes('bad request') ||
    combinedText.includes('context length exceeded') ||
    combinedText.includes('maximum context length')
  ) {
    // If context length is exceeded, a larger context model might be retryable
    const isContextLength = combinedText.includes('context length');
    return {
      retryable: isContextLength,
      reason: 'INVALID_REQUEST',
      statusCode: statusCode || 400,
      errorCode: errorCode || 'INVALID_ARGUMENT',
      errorName,
      sanitizedMessage: sanitized,
    };
  }

  // Default Fallback
  return {
    retryable: Boolean(errObj.retryable || errObj.isRetryable),
    reason: 'UNKNOWN',
    statusCode,
    errorCode: errorCode || 'UNKNOWN',
    errorName,
    sanitizedMessage: sanitized,
  };
}
