/**
 * Centralized Frontend API Client (`apiFetch`)
 *
 * Security invariants:
 * - Zero hardcoded secrets or fallback tokens.
 * - Zero persistence in localStorage, sessionStorage, cookies, or DOM attributes.
 * - API key (if configured by an authenticated operator at runtime) lives strictly in volatile JS memory.
 * - Never appends apiKey, api_key, or token to URL query parameters.
 * - Delegates underlying network call to `globalThis.fetch` for seamless testability.
 */

let inMemoryApiKey: string | null = null;

/**
 * Sets or clears the operator API key strictly in volatile memory.
 * Never persists to localStorage or sessionStorage.
 */
export function setInMemoryApiKey(key: string | null | undefined): void {
  if (typeof key === 'string' && key.trim().length > 0) {
    inMemoryApiKey = key.trim();
  } else {
    inMemoryApiKey = null;
  }
}

/**
 * Returns whether an operator API key is currently held in volatile memory.
 */
export function hasInMemoryApiKey(): boolean {
  return Boolean(inMemoryApiKey && inMemoryApiKey.length > 0);
}

/**
 * Builds request headers, attaching `X-API-Key` only when available in volatile memory.
 */
export function buildApiHeaders(existing?: HeadersInit, hasJsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {};

  if (existing) {
    if (existing instanceof Headers) {
      existing.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(existing)) {
      for (const [key, value] of existing) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, existing);
    }
  }

  if (hasJsonBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (inMemoryApiKey && !Object.keys(headers).some((k) => k.toLowerCase() === 'x-api-key' || k.toLowerCase() === 'authorization')) {
    headers['X-API-Key'] = inMemoryApiKey;
  }

  return headers;
}

/**
 * Centralized fetch wrapper for all `/api/*` requests.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const hasJsonBody = typeof init?.body === 'string';
  const headers = buildApiHeaders(init?.headers, hasJsonBody);

  const requestInit: RequestInit = {
    ...init,
    headers,
  };

  return globalThis.fetch(input, requestInit);
}

/**
 * Centralized JSON fetch helper with standardized HTTP error handling.
 */
export async function apiFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}
