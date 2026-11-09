/*----------------------------------
- RETRY
----------------------------------*/

/**
 * The opt-in retry (plan decision 16). Retried: a 429 `rate_limited` with a `Retry-After` within `maxDelayMs`, a 503
 * `not_ready` or `check_unavailable`, a 5xx without a problem body, and a network failure. The wait is `Retry-After`
 * when the answer gives one, otherwise exponential backoff with full jitter. Anything but a GET is retried only on the
 * 429: the call was refused, not run, while a timed-out metered POST may have spent a unit.
 */

/*----------------------------------
- TYPES
----------------------------------*/

export type RetryOptions = {
    /** How many times a call is tried, the first included. Defaults to 3. */
    attempts?: number;
    /** The longest wait. A longer `Retry-After` is not waited for: the error is thrown. Defaults to 30,000. */
    maxDelayMs?: number;
};

export type RetryPolicy = Required<RetryOptions>;

/** What the retry reads from an answer. */
export type RetryAnswer = {
    status: number;
    /** Seconds, from `Retry-After`. */
    retryAfter: number | null;
    /** The parsed error body. */
    body: unknown;
};

/*----------------------------------
- CONSTANTS
----------------------------------*/

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_MAX_DELAY_MS = 30_000;
const BACKOFF_BASE_MS = 500;
const RETRIED_503_CODES = new Set(['not_ready', 'check_unavailable']);

/*----------------------------------
- HELPERS
----------------------------------*/

/** @boundary The error body of an answer: a problem object from the API, or whatever a proxy answered. */
const codeOf = (body: unknown): string | null => {
    if (typeof body !== 'object' || body === null || !('code' in body)) return null;
    return typeof body.code === 'string' ? body.code : null;
};

/** `attempt` counts from 0, so the first wait is within 500 ms, the next within a second, up to `maxDelayMs`. */
const backoff = (policy: RetryPolicy, attempt: number): number => Math.random() * Math.min(policy.maxDelayMs, BACKOFF_BASE_MS * 2 ** attempt);

const waitOfRetryAfter = (policy: RetryPolicy, seconds: number): number | null => (seconds * 1000 <= policy.maxDelayMs ? seconds * 1000 : null);

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** The policy of a client's `retry` option, or null when it is off. */
export const resolveRetry = (option: boolean | RetryOptions | undefined): RetryPolicy | null => {
    if (!option) return null;
    const { attempts = DEFAULT_ATTEMPTS, maxDelayMs = DEFAULT_MAX_DELAY_MS } = option === true ? {} : option;
    if (!Number.isInteger(attempts) || attempts < 1) throw new TypeError(`retry.attempts must be a whole number, 1 or more: ${attempts}.`);
    if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) throw new TypeError(`retry.maxDelayMs must be 0 or more: ${maxDelayMs}.`);
    return { attempts, maxDelayMs };
};

/** How long to wait before trying again, or null to stop. `answer` is null on a network failure. */
export const retryWait = (policy: RetryPolicy, attempt: number, method: string, answer: RetryAnswer | null): number | null => {
    if (attempt + 1 >= policy.attempts) return null;
    const isGet = method === 'GET';
    if (!answer) return isGet ? backoff(policy, attempt) : null;
    const code = codeOf(answer.body);
    if (answer.status === 429) return code === 'rate_limited' && answer.retryAfter !== null ? waitOfRetryAfter(policy, answer.retryAfter) : null;
    if (!isGet) return null;
    const retried = (answer.status === 503 && code !== null && RETRIED_503_CODES.has(code)) || (answer.status >= 500 && code === null);
    if (!retried) return null;
    return answer.retryAfter === null ? backoff(policy, attempt) : waitOfRetryAfter(policy, answer.retryAfter);
};
