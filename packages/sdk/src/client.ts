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
import type { AnswerOf, ApiAnswerFacts, JsonObject, JsonValue, RequestArgs, RequestOptions } from './types';

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
    /** Headers sent on every call. */
    headers?: Readonly<Record<string, string>>;
    /** Another `fetch` (tests, a proxy agent). */
    fetch?: typeof fetch;
    /** The `User-Agent` sent under Node; `false` sends the runtime's own. Browsers never let a page set it. */
    userAgent?: string | false;
};

export type AuthMode = 'none' | 'member' | 'rapidapi';

export type UniqueDomainsClient = {
    /** Calls one operation by its id: `request('get_name', { path: { name: 'harbor.io' } })`. */
    request: <Id extends OperationId, P extends RequestParamsFor<Id> = RequestParamsFor<Id>>(operationId: Id, ...params: RequestArgs<Id, P>) => Promise<AnswerOf<Id, P>>;
    readonly baseUrl: string;
    readonly auth: AuthMode;
    /** The RapidAPI listing, when the client was created with `rapidApi`. */
    readonly listing: ListingDefinition | null;
};

type RequestParamsFor<Id extends OperationId> = import('./types').RequestParams<Id>;

/** The loose shape the internal openapi-fetch client is typed with: `request` types each call by operation id instead. */
type LooseOperation = {
    parameters: { path?: Record<string, string | number>; query?: Record<string, string | number | boolean | undefined> };
    requestBody?: { content: { 'application/json': JsonObject } };
    responses: { 200: { content: { 'application/json': JsonValue; 'text/plain': string } } };
};
type LoosePaths = Record<string, { get: LooseOperation; post: LooseOperation }>;

/** What `request` reads from its params at runtime, whatever the operation. */
type RuntimeParams = RequestOptions & {
    path?: Record<string, string | number>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: JsonObject;
    format?: 'json' | 'csv';
};

/*----------------------------------
- CONSTANTS
----------------------------------*/

// Member keys plan section 6: the one retry the SDK makes on its own is a 429 `rate_limited` that asks for one second
// (the per-key burst limit); a longer wait is the caller's decision, so it surfaces as the error.
const RETRY_AFTER_MAX_SECONDS = 1;

/*----------------------------------
- HELPERS
----------------------------------*/

const readEnvKey = (): string | undefined => {
    const env = typeof process === 'object' && process !== null ? process.env : undefined;
    const key = env?.UD_API_KEY?.trim();
    return key ? key : undefined;
};

const isNode = (): boolean => typeof process === 'object' && process !== null && typeof process.versions?.node === 'string';

const joinList = (value: string | readonly string[] | undefined): string | undefined => (value === undefined ? undefined : typeof value === 'string' ? value : value.join(','));

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
    }, { once: true });
});

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
    return { ...headers, ...options.headers };
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const createClient = (options: ClientOptions = {}): UniqueDomainsClient => {
    const { auth, apiKey, listing } = resolveAuth(options);
    const baseUrl = (options.baseUrl ?? (listing ? `https://${listing.host}` : API_PUBLIC_BASE)).replace(/\/+$/, '');
    const fetcher = createFetchClient<LoosePaths>({ baseUrl, headers: buildHeaders(options, apiKey, listing), ...(options.fetch ? { fetch: options.fetch } : {}) });

    const send = async (operationId: OperationId, params: RuntimeParams) => {
        const operation = OPERATIONS[operationId];
        const csv = params.format === 'csv';
        const text = csv || operation.answer === 'text';
        const query = { ...params.query, fields: joinList(params.fields) ?? params.query?.fields, include: joinList(params.include) ?? params.query?.include };
        const headers: Record<string, string> = { Accept: csv ? 'text/csv' : text ? '*/*' : 'application/json', ...params.headers };
        if (params.ifNoneMatch) headers['If-None-Match'] = params.ifNoneMatch;
        // The `.csv` form is the same path with `.csv` appended (`/tlds.csv`, `/tlds/{tld}/phases.csv`).
        const path = csv ? `${operation.path}.csv` : operation.path;
        const method = operation.method === 'POST' ? 'post' : 'get';
        return fetcher.request(method, path, {
            params: { path: params.path, query },
            ...(params.body !== undefined ? { body: params.body } : {}),
            headers,
            parseAs: text ? 'text' : 'json',
            ...(params.signal ? { signal: params.signal } : {}),
        });
    };

    const request = async (operationId: OperationId, params: RuntimeParams = {}): Promise<ApiAnswerFacts & Record<string, JsonValue | Headers | boolean | object | null>> => {
        const operation = OPERATIONS[operationId];
        if (!operation) throw new TypeError(`Unknown operation "${operationId}".`);
        if (listing && !listing.operations.includes(operationId)) throw new ListingMismatchError(operationId, listing, listingsServing(operationId));
        if (params.format === 'csv' && !operation.csv) throw new TypeError(`${operationId} has no CSV form.`);

        let answer = await send(operationId, params);
        let facts = readFacts(answer.response);
        if (answer.response.status === 429 && facts.retryAfter !== null && facts.retryAfter <= RETRY_AFTER_MAX_SECONDS && isRateLimited(answer.error)) {
            await sleep(facts.retryAfter * 1000, params.signal);
            answer = await send(operationId, params);
            facts = readFacts(answer.response);
        }

        if (answer.response.status === 304) return { ...facts, notModified: true };
        if (!answer.response.ok) throw ApiProblemError.from(answer.error, answer.response, facts);
        const text = params.format === 'csv' || operation.answer === 'text';
        if (text) return { ...facts, notModified: false, text: typeof answer.data === 'string' ? answer.data : '', contentType: answer.response.headers.get('content-type') };
        return { ...toEnvelope(answer.data), ...facts, notModified: false };
    };

    return {
        // The generic signature lives on the type; the runtime reads the operation table. The one cast in the SDK:
        // a generic function cannot be checked against per-operation types it only narrows at call sites.
        request: request as UniqueDomainsClient['request'],
        baseUrl,
        auth,
        listing,
    };
};

/** @boundary The parsed error body of a 429: a problem object from the API, or whatever a proxy answered. */
const isRateLimited = (body: unknown): boolean => typeof body === 'object' && body !== null && 'code' in body && body.code === 'rate_limited';

/** @boundary The parsed JSON body of a 200 or 202: the API's `{ data, meta, links }` envelope. */
const toEnvelope = (body: unknown): Record<string, JsonValue> => (typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body } : { data: null });
