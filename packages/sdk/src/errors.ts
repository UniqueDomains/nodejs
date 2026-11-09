/*----------------------------------
- ERRORS
----------------------------------*/

/**
 * Two errors make the SDK's contract: `ApiProblemError` for every answer that is not a success (the API's problem
 * body, or one built for an answer that carried none), and `ListingMismatchError` for a call a RapidAPI listing does
 * not serve, thrown before any request. A network failure stays the runtime's own `TypeError` from `fetch`.
 *
 * `ApiProblemError.from` picks a subclass by the problem's code (plan decision 15), so a caller branches on the kind
 * with `instanceof`. A code no subclass claims, a newer API's included, stays a plain `ApiProblemError`.
 */

import type { ApiAnswerFacts, ApiProblem, ApiQuota, ApiRateLimit, JsonValue, ProblemCode } from './types';

/*----------------------------------
- HELPERS
----------------------------------*/

const isRecord = (value: unknown): value is Record<string, JsonValue | undefined> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A body kept for the caller: the object itself, or at most 2,000 characters of text. */
const keepRaw = (body: unknown): JsonValue => (isRecord(body) ? { ...body } : typeof body === 'string' ? body.slice(0, 2000) : null);

/**
 * @boundary The error body of an answer, parsed by openapi-fetch: a problem object from the API, or text from
 *           whatever stood between (a proxy, a load balancer).
 * `status` is the answer's own status, never the body's: a gateway may rewrite one and not the other (review R1-17).
 */
const toProblem = (body: unknown, status: number, statusText: string, instance: string): ApiProblem => {
    if (isRecord(body) && typeof body.code === 'string' && typeof body.detail === 'string') {
        const code: ProblemCode = body.code;
        return {
            ...body,
            type: typeof body.type === 'string' ? body.type : 'about:blank',
            title: typeof body.title === 'string' ? body.title : statusText,
            status,
            detail: body.detail,
            instance: typeof body.instance === 'string' ? body.instance : instance,
            code,
        };
    }
    // Not a problem body: a gateway's own refusal (RapidAPI answers `{ "message": "..." }`) or a proxy's page. Its
    // message becomes the detail and the body is kept in `raw`, so the reason is never lost (self-review 2).
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : null;
    return unexpected(status, statusText, instance, message ?? `The API answered ${status} without a problem body.`, keepRaw(body));
};

const unexpected = (status: number, statusText: string, instance: string, detail: string, raw: JsonValue): ApiProblem => ({
    type: 'about:blank',
    title: statusText || 'Unexpected response',
    status,
    detail,
    instance,
    code: 'unexpected_response',
    raw,
});

const instanceOf = (response: Response): string => new URL(response.url || 'http://localhost/').pathname;

/*----------------------------------
- PUBLIC API
----------------------------------*/

export class ApiProblemError extends Error {
    override readonly name: string = 'ApiProblemError';
    readonly status: number;
    readonly code: ProblemCode;
    readonly title: string;
    readonly detail: string;
    readonly type: string;
    readonly instance: string;
    /** Where to get what was refused, on a tier or plan refusal: the plans page, or the upgrade sheet for a member key. */
    readonly product: string | null;
    /** Seconds to wait, from `Retry-After` (a 429 or a 503). */
    readonly retryAfter: number | null;
    /** The whole problem body, extension members included (`reason`, `suggestion`, `allowed`, ...). */
    readonly problem: ApiProblem;
    readonly headers: Headers;
    readonly quota: ApiQuota | null;
    readonly rateLimit: ApiRateLimit | null;

    constructor(problem: ApiProblem, facts: ApiAnswerFacts) {
        super(problem.detail);
        this.problem = problem;
        this.status = problem.status;
        this.code = problem.code;
        this.title = problem.title;
        this.detail = problem.detail;
        this.type = problem.type;
        this.instance = problem.instance;
        this.product = typeof problem.product === 'string' ? problem.product : null;
        this.retryAfter = facts.retryAfter;
        this.headers = facts.headers;
        this.quota = facts.quota;
        this.rateLimit = facts.rateLimit;
    }

    /** @boundary `body` is the error body openapi-fetch parsed from the answer. */
    static from(body: unknown, response: Response, facts: ApiAnswerFacts): ApiProblemError {
        const problem = toProblem(body, response.status, response.statusText, instanceOf(response));
        const ProblemClass = ERROR_CLASSES.get(problem.code) ?? ApiProblemError;
        return new ProblemClass(problem, facts);
    }

    /**
     * @boundary A success answer the SDK could not read as the API's (not JSON, or not the `{ data, meta, links }`
     *           envelope): a captive portal, a CDN page, a wrong `baseUrl` (review R1-5). Its body is kept in `raw`.
     */
    static unreadable(body: unknown, response: Response, facts: ApiAnswerFacts): ApiProblemError {
        const detail = `The answer to ${instanceOf(response)} (${response.status}) is not the API's JSON envelope.`;
        return new ApiProblemError(unexpected(response.status, response.statusText, instanceOf(response), detail, keepRaw(body)), facts);
    }
}

/** `rate_limited`: too many calls for now. `retryAfter` says how many seconds to wait. */
export class RateLimitError extends ApiProblemError {
    override readonly name: string = 'RateLimitError';
}

/** The month's calls or units, or a day's cap, are spent. `quota` and `retryAfter` say what is left and when it returns. */
export class QuotaError extends ApiProblemError {
    override readonly name: string = 'QuotaError';
}

/** The operation needs a key or a higher plan. `product` says where to get it. */
export class PlanRequiredError extends ApiProblemError {
    override readonly name: string = 'PlanRequiredError';
}

export class NotFoundError extends ApiProblemError {
    override readonly name: string = 'NotFoundError';
}

/** A parameter, a cursor, a field or a format the API refused. `problem` carries `reason`, `suggestion` or `allowed`. */
export class ValidationError extends ApiProblemError {
    override readonly name: string = 'ValidationError';
}

/** The key was refused, or it belongs to another listing. */
export class AuthError extends ApiProblemError {
    override readonly name: string = 'AuthError';
}

/** The answer is not ready, or a check could not run just now. Try again later. */
export class NotReadyError extends ApiProblemError {
    override readonly name: string = 'NotReadyError';
}

/** The word cannot be taken into the catalog. `code` says why. */
export class WordRejectedError extends ApiProblemError {
    override readonly name: string = 'WordRejectedError';
}

const ERROR_CLASSES: ReadonlyMap<string, typeof ApiProblemError> = new Map<string, typeof ApiProblemError>([
    ['rate_limited', RateLimitError],
    ...['quota_spent', 'budget_spent', 'consumer_day_cap', 'intake_day_cap'].map((code): [string, typeof ApiProblemError] => [code, QuotaError]),
    ...['plan_required', 'keyed_only'].map((code): [string, typeof ApiProblemError] => [code, PlanRequiredError]),
    ['not_found', NotFoundError],
    ...['validation_failed', 'cursor_invalid', 'unsupported_field', 'unsupported_format'].map((code): [string, typeof ApiProblemError] => [code, ValidationError]),
    ...['invalid_key', 'invalid_proxy_secret', 'listing_mismatch'].map((code): [string, typeof ApiProblemError] => [code, AuthError]),
    ...['not_ready', 'check_unavailable', 'gate_unavailable'].map((code): [string, typeof ApiProblemError] => [code, NotReadyError]),
    ...['invalid_word', 'disabled_in_catalog', 'not_a_word', 'brand', 'offensive'].map((code): [string, typeof ApiProblemError] => [code, WordRejectedError]),
]);

export class ListingMismatchError extends Error {
    override readonly name = 'ListingMismatchError';
    readonly operationId: string;
    /** The listing the client's RapidAPI key subscribes to. */
    readonly listing: string;
    /** The listings whose subscription opens the operation. */
    readonly servedBy: readonly string[];

    constructor(operationId: string, listing: { id: string; title: string }, servedBy: readonly { id: string }[]) {
        const where = servedBy.length > 0 ? ` It is in: ${servedBy.map((entry) => entry.id).join(', ')}.` : ' No RapidAPI listing serves it.';
        super(`${operationId} is not part of the ${listing.title} listing (${listing.id}).${where}`);
        this.operationId = operationId;
        this.listing = listing.id;
        this.servedBy = servedBy.map((entry) => entry.id);
    }
}
