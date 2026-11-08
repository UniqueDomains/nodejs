/*----------------------------------
- ANSWER HEADERS
----------------------------------*/

/**
 * Reads the quota, rate-limit and retry headers into typed facts. A missing or malformed header reads as null, never
 * as 0: a caller deciding whether to wait must not mistake "unknown" for "nothing left".
 */

import type { ApiAnswerFacts, ApiQuota, ApiRateLimit } from './types';

/*----------------------------------
- HELPERS
----------------------------------*/

const integer = (headers: Headers, name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** `X-Quota-*`, written on a member key's answers that reached the month counter (member keys plan decision 6). */
export const parseQuota = (headers: Headers): ApiQuota | null => {
    const limit = integer(headers, 'x-quota-limit');
    const remaining = integer(headers, 'x-quota-remaining');
    if (limit === null || remaining === null) return null;
    const reset = integer(headers, 'x-quota-reset');
    const unitName = headers.get('x-quota-unit');
    const unitLimit = integer(headers, 'x-quota-unit-limit');
    const unitRemaining = integer(headers, 'x-quota-unit-remaining');
    return {
        limit,
        remaining,
        // `X-Quota-Reset` is a unix time in seconds (the first instant of the next UTC month).
        resetsAt: reset === null ? null : new Date(reset * 1000),
        unit: unitName && unitLimit !== null && unitRemaining !== null ? { name: unitName, limit: unitLimit, remaining: unitRemaining } : null,
    };
};

/** `X-RateLimit-*`, the keyless window; `X-RateLimit-Reset` counts seconds until the window resets. */
export const parseRateLimit = (headers: Headers): ApiRateLimit | null => {
    const limit = integer(headers, 'x-ratelimit-limit');
    const remaining = integer(headers, 'x-ratelimit-remaining');
    if (limit === null || remaining === null) return null;
    return { limit, remaining, resetInSeconds: integer(headers, 'x-ratelimit-reset') };
};

/** `Retry-After` in seconds: the API sends delta seconds; an HTTP date (allowed by RFC 9110) is converted. */
export const parseRetryAfter = (headers: Headers, now: number = Date.now()): number | null => {
    const raw = headers.get('retry-after');
    if (raw === null || raw.trim() === '') return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);
    const date = Date.parse(raw);
    return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
};

export const readFacts = (response: Response): ApiAnswerFacts => ({
    status: response.status,
    headers: response.headers,
    etag: response.headers.get('etag'),
    quota: parseQuota(response.headers),
    rateLimit: parseRateLimit(response.headers),
    retryAfter: parseRetryAfter(response.headers),
    location: response.headers.get('location'),
});
