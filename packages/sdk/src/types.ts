/*----------------------------------
- PUBLIC TYPES
----------------------------------*/

/**
 * The types a caller meets: the envelope and the problem from the document's schema, a request's parameters by
 * operation id, and the three kinds of answer (the envelope, a text file, not modified). Everything about one
 * operation is read from `operations[Id]` of the generated schema, so a regenerated snapshot retypes every call.
 */

import type { components, operations } from './generated/schema';
import type { CsvOperationId, OperationId, TextOperationId } from './generated/operations';

/*----------------------------------
- TYPES: THE WIRE
----------------------------------*/

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue | undefined };

export type ApiMeta = components['schemas']['Meta'];

/** `details`, the public website page of the subject, is declared by the API's envelope but not yet filled. */
export type ApiLinks = components['schemas']['Links'] & { details?: string | null };

/** The problem codes the document lists. */
export type ApiProblemCode = components['schemas']['Problem']['code'];

/**
 * The code an `ApiProblemError` carries: one the document lists, `unexpected_response` for an answer the SDK could
 * not read as the API's (a gateway's own refusal, a proxy's page, a success body that is not the envelope), or a code
 * a newer API added since this snapshot (kept as its string; `string & Record<never, never>` keeps the listed codes
 * offered by an editor).
 */
export type ProblemCode = ApiProblemCode | 'unexpected_response' | (string & Record<never, never>);

/**
 * `application/problem+json` as the error carries it, with its extension members (`reason`, `suggestion`,
 * `allowed`, `product`, ...). `raw` holds the body of an `unexpected_response`.
 */
export type ApiProblem = {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: ProblemCode;
    product?: string;
    raw?: JsonValue;
    readonly [extension: string]: JsonValue | undefined;
};

export type ApiEnvelope<TData> = { data: TData; meta: ApiMeta; links: ApiLinks };

/*----------------------------------
- TYPES: ONE OPERATION
----------------------------------*/

type ParametersOf<Id extends OperationId> = operations[Id]['parameters'];

/** The path parameters of an operation, `never` when it has none. */
export type PathParamsOf<Id extends OperationId> = NonNullable<ParametersOf<Id>['path']>;

/** The query parameters of an operation, `never` when it has none. */
export type QueryParamsOf<Id extends OperationId> = NonNullable<ParametersOf<Id>['query']>;

/** The JSON body of an operation, `never` when it takes none. */
export type BodyOf<Id extends OperationId> = JsonBodyOf<NonNullable<operations[Id]['requestBody']>>;

// Distributive on purpose: an operation without a body has `requestBody?: never`, which must read as `never`, not as
// the `unknown` a non-distributive `never extends ...` would infer.
type JsonBodyOf<RequestBody> = RequestBody extends { content: { 'application/json': infer Body } } ? Body : never;

type SuccessOf<Id extends OperationId> = operations[Id]['responses'] extends { 200: { content: { 'application/json': infer Envelope } } } ? Envelope : never;

/** The `{ data, meta, links }` body of an operation's 200 answer. */
export type EnvelopeOf<Id extends OperationId> = SuccessOf<Id>;

/** The `data` of an operation's 200 answer. */
export type DataOf<Id extends OperationId> = SuccessOf<Id> extends { data: infer Data } ? Data : never;

/*----------------------------------
- TYPES: A REQUEST
----------------------------------*/

/** Options every call takes, beside the operation's own parameters. */
export type RequestOptions = {
    /**
     * A previous answer's `etag`: an unchanged answer comes back as `{ notModified: true }` (a 304). Null sends none.
     * The one way to send `If-None-Match`: the header is removed from `headers` so the answer type stays true.
     */
    ifNoneMatch?: string | null;
    signal?: AbortSignal;
    /** Extra headers for this call only (`If-None-Match` excepted: use `ifNoneMatch`). */
    headers?: Readonly<Record<string, string>>;
};

/** A `fields` or `include` value: a comma-separated string or a list; an empty list sends nothing. */
export type ListOption = string | readonly string[];

type HasQueryKey<Id extends OperationId, Key extends string> = [QueryParamsOf<Id>] extends [never] ? false : Key extends keyof QueryParamsOf<Id> ? true : false;

/**
 * `fields` keeps the listed top-level keys; the answer is still typed as the full row, so read a key you did not
 * keep as missing. Offered only where the operation declares `fields` (`include` the same).
 */
export type ProjectionPart<Id extends OperationId> = (HasQueryKey<Id, 'fields'> extends true ? { fields?: ListOption } : { fields?: undefined })
    & (HasQueryKey<Id, 'include'> extends true ? { include?: ListOption } : { include?: undefined });

type PathPart<Id extends OperationId> = [PathParamsOf<Id>] extends [never] ? { path?: undefined } : { path: PathParamsOf<Id> };
type QueryPart<Id extends OperationId> = [QueryParamsOf<Id>] extends [never] ? { query?: undefined } : { query?: QueryParamsOf<Id> };
type BodyPart<Id extends OperationId> = [BodyOf<Id>] extends [never] ? { body?: undefined } : { body: BodyOf<Id> };
type FormatPart<Id extends OperationId> = Id extends CsvOperationId ? { format?: 'json' | 'csv' } : { format?: 'json' };

/** What `request(operationId, params)` takes for one operation. */
export type RequestParams<Id extends OperationId> = PathPart<Id> & QueryPart<Id> & BodyPart<Id> & FormatPart<Id> & ProjectionPart<Id> & RequestOptions;

type RequiredKeys<T> = { [Key in keyof T]-?: object extends Pick<T, Key> ? never : Key }[keyof T];

type NoExtraKeys<P, Shape> = { [Key in Exclude<keyof P, keyof Shape>]: never };

/**
 * `P` with no key the operation does not take, at the top level and inside `path`, `query` and `body` (review
 * R1-6): a misspelled `qurey` or `limt` is a compile error instead of a parameter dropped or sent.
 */
export type ExactParams<Id extends OperationId, P> = NoExtraKeys<P, RequestParams<Id>> & {
    // Homomorphic over `keyof P`, so an optional key stays optional.
    [Key in keyof P]: Key extends 'path' | 'query' | 'body' ? ExactInner<P[Key], NonNullable<RequestParams<Id>[Key & keyof RequestParams<Id>]>> : P[Key];
};

// Distributive over `V`, so `{ ... } | undefined` checks the object and keeps `undefined`.
type ExactInner<V, Shape> = V extends object ? V & NoExtraKeys<V, Shape> : V;

/** `params` may be left out when the operation has no required path parameter or body. */
export type RequestArgs<Id extends OperationId, P> = [RequiredKeys<RequestParams<Id>>] extends [never] ? [params?: ExactParams<Id, P>] : [params: ExactParams<Id, P>];

/**
 * The params of `requestOperation`, for an operation id known only at run time (the CLI's command loop, an MCP
 * server's tool loop): the same keys, checked at run time against the operation table instead of at compile time.
 */
export type OperationRequestParams = RequestOptions & {
    path?: Readonly<Record<string, string | number>>;
    query?: Readonly<Record<string, string | number | boolean | undefined>>;
    body?: JsonObject;
    format?: 'json' | 'csv';
    fields?: ListOption;
    include?: ListOption;
};

/*----------------------------------
- TYPES: AN ANSWER
----------------------------------*/

/** The member key's month, from `X-Quota-*` (member keys only; RapidAPI sends its own headers, see `headers`). */
export type ApiQuota = {
    limit: number;
    remaining: number;
    /** The first instant of the next month (UTC), from `X-Quota-Reset`. */
    resetsAt: Date | null;
    /** The metered unit this call spends (`Live`, `Appraisal`, `Intake`), with its own month. */
    unit: { name: string; limit: number; remaining: number } | null;
};

/** The keyless window, from `X-RateLimit-Limit`, `-Remaining` and `-Reset` (seconds until the window resets). */
export type ApiRateLimit = {
    limit: number;
    remaining: number;
    resetInSeconds: number | null;
};

/** What every answer carries beside its body. */
export type ApiAnswerFacts = {
    status: number;
    headers: Headers;
    /** The weak ETag to send back as `ifNoneMatch`. */
    etag: string | null;
    quota: ApiQuota | null;
    rateLimit: ApiRateLimit | null;
    /** Seconds, on a 202 (poll `location` then) or a 429. */
    retryAfter: number | null;
    /** On a 202: where to read the finished answer. */
    location: string | null;
};

/** A JSON answer: the envelope's `data`, `meta` and `links`, plus the answer's facts. */
export type ApiResult<TEnvelope> = TEnvelope & ApiAnswerFacts & { notModified: false };

/** A file answer: a `.csv` form, the document, `llms.txt` or a calendar. */
export type ApiTextResult = ApiAnswerFacts & { notModified: false; text: string; contentType: string | null };

/** A 304 to an `ifNoneMatch` call: keep the answer you have. */
export type ApiNotModified = ApiAnswerFacts & { notModified: true };

/** What `requestOperation` answers: any of the three, to narrow on `notModified` and `'text' in answer`. */
export type OperationAnswer = ApiResult<ApiEnvelope<JsonValue>> | ApiTextResult | ApiNotModified;

/**
 * The answer of `request(Id, P)`, from the operation and the options passed. Sound for values only known at run time
 * (review finding 3): an `ifNoneMatch` that may hold a string adds the 304 to the union, and a `format` that may be
 * `'csv'` adds the text answer. The tuple wrapping keeps `P = never` (no params passed) at the plain envelope.
 */
export type AnswerOf<Id extends OperationId, P> = MayBeNotModified<P> | BodyAnswer<Id, P>;

// Reads a key by `keyof`, not by `P extends { key?: X }`: an all-optional object type is a "weak type", and a params
// object without that key would fail the weak-type check and fall into the wrong branch.
type FieldOf<P, Key extends PropertyKey> = Key extends keyof P ? P[Key] : undefined;

type MayBeNotModified<P> = [Exclude<FieldOf<P, 'ifNoneMatch'>, undefined | null>] extends [never] ? never : ApiNotModified;

type BodyAnswer<Id extends OperationId, P> = Id extends TextOperationId
    ? ApiTextResult
    : [Extract<FieldOf<P, 'format'>, 'csv'>] extends [never]
        ? ApiResult<EnvelopeOf<Id>>
        : [Exclude<FieldOf<P, 'format'>, 'csv' | undefined>] extends [never]
            ? ApiTextResult
            : ApiResult<EnvelopeOf<Id>> | ApiTextResult;
