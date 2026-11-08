/*----------------------------------
- CLIENT
----------------------------------*/

/**
 * `createClient` (plan decision 6): `openapi-fetch` makes the calls, the generated `operations` type types them, and
 * every call is addressed by its operation id, the name the website's reference and the CLI use for it. Three ways
 * in: no key (the free grade), a member key (`Authorization: Bearer`), or a RapidAPI key with its listing (the
 * listing's own host). Every success is the envelope plus the answer's facts; every failure is an `ApiProblemError`.
 *
 * Decision: no path-based methods (`GET('/names/{name}')`) beside `request`. One addressing scheme keeps the public
 * surface small and is the one the CLI and the MCP server are generated from; openapi-fetch stays an implementation
 * detail, so it can be replaced without a breaking change.
 */

import createFetchClient from 'openapi-fetch';
import { ApiProblemError, ListingMismatchError } from './errors';
import { readFacts } from './headers';
import { findListing, listingsServing, type ListingDefinition } from './listing';
import { API_PUBLIC_BASE, OPERATIONS, type OperationId } from './generated/operations';
import type { ListingId } from './generated/listings';
import type { AnswerOf, ApiAnswerFacts, ApiEnvelope, ApiResult, JsonObject, JsonValue, ListOption, OperationAnswer, OperationRequestParams, RequestArgs, RequestParams } from './types';

/*----------------------------------
- TYPES
----------------------------------*/

declare const __SDK_VERSION__: string;

/** The SDK's version, also sent in the default `User-Agent` under Node. */
export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev';

export type ClientOptions = {
    /**
     * A member key (`ud_live_...`, Settings, Account, API in the product). Defaults to `UD_API_KEY` from the
     * environment; `null` calls without a key even when `UD_API_KEY` is set.
     */
    apiKey?: string | null;
    /** A RapidAPI key and the listing it subscribes to: calls go to that listing's host, for its operations only. */
    rapidApi?: { key: string; listing: ListingId };
    /** Another base URL (a local run). Defaults to `https://api.unique.domains/v1`, or the listing's host with `rapidApi`. */
    baseUrl?: string;
    /** Headers sent on every call (`If-None-Match` excepted: pass `ifNoneMatch` per call). */
    headers?: Readonly<Record<string, string>>;
    /** Another `fetch` (tests, a proxy agent). */
    fetch?: typeof fetch;
    /** The `User-Agent` sent under Node; `false` sends the runtime's own. Browsers never let a page set it. */
    userAgent?: string | false;
};

export type AuthMode = 'none' | 'member' | 'rapidapi';

export type UniqueDomainsClient = {
    /**
     * Calls one operation by its id: `request('get_name', { path: { name: 'harbor.io' } })`. `P` defaults to `never`
     * so a call without params types as the plain envelope (see `AnswerOf`).
     */
    request: <Id extends OperationId, P extends RequestParams<Id> = never>(operationId: Id, ...params: RequestArgs<Id, P>) => Promise<AnswerOf<Id, P>>;
    /**
     * Calls an operation whose id is known only at run time (a command or tool loop): the same call as `request`,
     * with the params checked at run time against the operation table, and the answer to narrow on `notModified` and
     * `'text' in answer` (review R1-2).
     */
    requestOperation: (operationId: OperationId, params?: OperationRequestParams) => Promise<OperationAnswer>;
    readonly baseUrl: string;
    readonly auth: AuthMode;
    /** The RapidAPI listing, when the client was created with `rapidApi`. */
    readonly listing: ListingDefinition | null;
};

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * The loose shape the internal openapi-fetch client is typed with: every call is parsed as text and read by the SDK
 * (review R1-5), and `request` types each call by operation id instead.
 */
type LooseOperation = {
    parameters: { path?: Readonly<Record<string, string | number>>; query?: Readonly<Record<string, string | number | boolean | undefined>> };
    requestBody?: { content: { 'application/json': JsonObject } };
    responses: { 200: { content: { 'text/plain': string } } };
};
type LoosePaths = Record<string, Record<HttpMethod, LooseOperation>>;

/*----------------------------------
- CONSTANTS
----------------------------------*/

// Member keys plan section 6: the one retry the SDK makes on its own is a 429 `rate_limited` whose `Retry-After` is
// exactly `1` (the per-key burst limiter's answer). Any other wait, 0 or a date included, is the caller's decision,
// so it surfaces as the error (review R1-15).
const RETRY_AFTER_HEADER = '1';
const RETRY_DELAY_MS = 1000;

/** Path values the URL parser would resolve away (`..` climbs out of the operation's path; review R1-16). */
const DOT_SEGMENTS = new Set(['', '.', '..']);

/*----------------------------------
- HELPERS
----------------------------------*/

const readEnvKey = (): string | undefined => {
    const env = typeof process === 'object' && process !== null ? process.env : undefined;
    const key = env?.UD_API_KEY?.trim();
    return key ? key : undefined;
};

const isNode = (): boolean => typeof process === 'object' && process !== null && typeof process.versions?.node === 'string';

/** An empty list or string sends nothing, never an empty `fields=` (review R1-8). */
const joinList = (value: ListOption | undefined): string | undefined => {
    const joined = value === undefined ? '' : typeof value === 'string' ? value : value.join(',');
    return joined.trim() ? joined : undefined;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(signal.reason);
        return;
    }
    const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
    };
    const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
});

/** `If-None-Match` comes only from `ifNoneMatch`, so a 304 is never an answer the types call impossible (R1-7). */
const withoutConditional = (headers: Readonly<Record<string, string>> | undefined): Record<string, string> =>
    Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== 'if-none-match'));

const declaresQuery = (operationId: OperationId, name: string): boolean => OPERATIONS[operationId].parameters.some((param) => param.in === 'query' && param.name === name);

/** What `requestOperation` refuses before any call: the checks the types make for `request`. */
const checkParams = (operationId: OperationId, params: OperationRequestParams): void => {
    const operation = OPERATIONS[operationId];
    if (params.format === 'csv' && !operation.csv) throw new TypeError(`${operationId} has no CSV form.`);
    for (const option of ['fields', 'include'] as const) {
        if (joinList(params[option]) !== undefined && !declaresQuery(operationId, option)) throw new TypeError(`${operationId} takes no ${option}.`);
    }
    for (const param of operation.parameters.filter((entry) => entry.in === 'path')) {
        const value = String(params.path?.[param.name] ?? '');
        if (DOT_SEGMENTS.has(value)) throw new TypeError(`${operationId}: ${param.name} cannot be "${value}".`);
    }
};

const resolveAuth = (options: ClientOptions): { auth: AuthMode; apiKey: string | null; listing: ListingDefinition | null } => {
    if (options.rapidApi) {
        if (typeof options.apiKey === 'string') throw new TypeError('Pass either apiKey or rapidApi, not both.');
        const listing = findListing(options.rapidApi.listing);
        if (!listing) throw new TypeError(`Unknown RapidAPI listing "${options.rapidApi.listing}".`);
        if (!options.rapidApi.key) throw new TypeError('rapidApi.key is empty.');
        return { auth: 'rapidapi', apiKey: null, listing };
    }
    const apiKey = options.apiKey === null ? null : (options.apiKey ?? readEnvKey() ?? null);
    return { auth: apiKey ? 'member' : 'none', apiKey, listing: null };
};

const buildHeaders = (options: ClientOptions, apiKey: string | null, listing: ListingDefinition | null): Record<string, string> => {
    const headers: Record<string, string> = {};
    const userAgent = options.userAgent ?? `uniquedomains-sdk/${SDK_VERSION}`;
    if (userAgent && isNode()) headers['User-Agent'] = userAgent;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (listing && options.rapidApi) {
        headers['X-RapidAPI-Key'] = options.rapidApi.key;
        headers['X-RapidAPI-Host'] = listing.host;
    }
    return { ...headers, ...withoutConditional(options.headers) };
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const createClient = (options: ClientOptions = {}): UniqueDomainsClient => {
    const { auth, apiKey, listing } = resolveAuth(options);
    const baseUrl = (options.baseUrl ?? (listing ? `https://${listing.host}` : API_PUBLIC_BASE)).replace(/\/+$/, '');
    const fetcher = createFetchClient<LoosePaths>({ baseUrl, headers: buildHeaders(options, apiKey, listing), ...(options.fetch ? { fetch: options.fetch } : {}) });

    const send = async (operationId: OperationId, params: OperationRequestParams, asText: boolean) => {
        const operation = OPERATIONS[operationId];
        const csv = params.format === 'csv';
        const query = { ...params.query, fields: joinList(params.fields) ?? params.query?.fields, include: joinList(params.include) ?? params.query?.include };
        const headers: Record<string, string> = { Accept: csv ? 'text/csv' : asText ? '*/*' : 'application/json', ...withoutConditional(params.headers) };
        if (params.ifNoneMatch) headers['If-None-Match'] = params.ifNoneMatch;
        // The `.csv` form is the same path with `.csv` appended (`/tlds.csv`, `/tlds/{tld}/phases.csv`).
        const path = csv ? `${operation.path}.csv` : operation.path;
        // Every answer is read as text and parsed here, so a success that is not JSON becomes an `ApiProblemError`,
        // not a raw `SyntaxError` from openapi-fetch (review R1-5).
        return fetcher.request(toHttpMethod(operation.method), path, {
            params: { path: params.path, query },
            ...(params.body !== undefined ? { body: params.body } : {}),
            headers,
            parseAs: 'text',
            ...(params.signal ? { signal: params.signal } : {}),
        });
    };

    const requestOperation = async (operationId: OperationId, params: OperationRequestParams = {}): Promise<OperationAnswer> => {
        const operation = OPERATIONS[operationId];
        if (!operation) throw new TypeError(`Unknown operation "${operationId}".`);
        if (listing && !listing.operations.includes(operationId)) throw new ListingMismatchError(operationId, listing, listingsServing(operationId));
        checkParams(operationId, params);
        const asText = params.format === 'csv' || operation.answer === 'text';

        let answer = await send(operationId, params, asText);
        if (answer.response.status === 429 && answer.response.headers.get('retry-after')?.trim() === RETRY_AFTER_HEADER && isRateLimited(answer.error)) {
            await sleep(RETRY_DELAY_MS, params.signal);
            answer = await send(operationId, params, asText);
        }
        const facts = readFacts(answer.response);

        if (answer.response.status === 304) return { ...facts, notModified: true };
        if (!answer.response.ok) throw ApiProblemError.from(answer.error, answer.response, facts);
        const text = typeof answer.data === 'string' ? answer.data : '';
        if (asText) return { ...facts, notModified: false, text, contentType: answer.response.headers.get('content-type') };
        const envelope = parseEnvelope(text);
        if (!envelope) throw ApiProblemError.unreadable(text, answer.response, facts);
        const result: ApiResult<ApiEnvelope<JsonValue>> = { ...envelope, ...facts, notModified: false };
        return result;
    };

    return {
        // The generic signature lives on the type; the runtime is `requestOperation`. A cast: a generic function cannot
        // be checked against per-operation types it only narrows at call sites (the other cast is `parseEnvelope`).
        request: requestOperation as UniqueDomainsClient['request'],
        requestOperation,
        baseUrl,
        auth,
        listing,
    };
};

const toHttpMethod = (method: string): HttpMethod => {
    const lower = method.toLowerCase();
    if (lower === 'get' || lower === 'post' || lower === 'put' || lower === 'patch' || lower === 'delete') return lower;
    throw new TypeError(`Unsupported method ${method}.`);
};

/** @boundary The parsed error body of a 429: a problem object from the API, or whatever a proxy answered. */
const isRateLimited = (body: unknown): boolean => typeof body === 'object' && body !== null && 'code' in body && body.code === 'rate_limited';

/**
 * @boundary The text of a 200 or 202: the `{ data, meta, links }` envelope when it is JSON of that shape, else null.
 *           The second of the SDK's two casts: the shape is checked here, the field types are the document's.
 */
const parseEnvelope = (text: string): ApiEnvelope<JsonValue> | null => {
    let body: JsonValue;
    try {
        body = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body) || !('data' in body)) return null;
    const { data, meta, links } = body as { data: JsonValue; meta?: ApiEnvelope<JsonValue>['meta']; links?: ApiEnvelope<JsonValue>['links'] };
    if (typeof meta !== 'object' || meta === null || typeof links !== 'object' || links === null) return null;
    return { ...body, data, meta, links };
};
