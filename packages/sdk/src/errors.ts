/*----------------------------------
- ERRORS
----------------------------------*/

/**
 * Two errors make the SDK's contract: `ApiProblemError` for every answer that is not a success (the API's problem
 * body, or one built for an answer that carried none), and `ListingMismatchError` for a call a RapidAPI listing does
 * not serve, thrown before any request. A network failure stays the runtime's own `TypeError` from `fetch`.
 */

import type { ApiAnswerFacts, ApiProblemCode, ApiQuota, ApiRateLimit, JsonValue } from './types';

/*----------------------------------
- TYPES
----------------------------------*/

/**
 * `unexpected_response`: an error answer without a problem body (a gateway's own refusal, a proxy's HTML page, an
 * empty 502); its body is in `problem.raw`.
 */
export type ProblemCode = ApiProblemCode | 'unexpected_response';

/** The problem body as the error carries it: `ApiProblem` with the code widened to `ProblemCode`. */
export type ProblemShape = {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: ProblemCode;
    product?: string;
    readonly [extension: string]: JsonValue | undefined;
};

/*----------------------------------
- HELPERS
----------------------------------*/

const isRecord = (value: unknown): value is Record<string, JsonValue | undefined> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @boundary The error body of an answer, parsed by openapi-fetch: a problem object from the API, or text from
 *           whatever stood between (a proxy, a load balancer).
 */
const toProblem = (body: unknown, status: number, statusText: string, instance: string): ProblemShape => {
    if (isRecord(body) && typeof body.code === 'string' && typeof body.detail === 'string') {
        return {
            ...body,
            type: typeof body.type === 'string' ? body.type : 'about:blank',
            title: typeof body.title === 'string' ? body.title : statusText,
            status: typeof body.status === 'number' ? body.status : status,
            detail: body.detail,
            instance: typeof body.instance === 'string' ? body.instance : instance,
            code: body.code as ProblemCode, // The API's own catalog; an unknown future code still reads as its string.
        };
    }
    // Not a problem body: a gateway's own refusal (RapidAPI answers `{ "message": "..." }`) or a proxy's page. Its
    // message becomes the detail and the body is kept in `raw`, so the reason is never lost (review finding 2).
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : null;
    const raw: JsonValue = isRecord(body) ? { ...body } : typeof body === 'string' ? body.slice(0, 2000) : null;
    return {
        type: 'about:blank',
        title: statusText || 'Unexpected response',
        status,
        detail: message ?? `The API answered ${status} without a problem body.`,
        instance,
        code: 'unexpected_response',
        raw,
    };
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export class ApiProblemError extends Error {
    override readonly name = 'ApiProblemError';
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
    readonly problem: ProblemShape;
    readonly headers: Headers;
    readonly quota: ApiQuota | null;
    readonly rateLimit: ApiRateLimit | null;

    constructor(problem: ProblemShape, facts: ApiAnswerFacts) {
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
        return new ApiProblemError(toProblem(body, response.status, response.statusText, new URL(response.url || 'http://localhost/').pathname), facts);
    }
}

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
