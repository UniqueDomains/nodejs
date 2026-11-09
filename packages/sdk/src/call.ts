/*----------------------------------
- API CALL
----------------------------------*/

/**
 * What a namespaced method returns (plan decision 14): a thenable that resolves to the answer's `data`, with
 * `.withMeta()` for the whole answer and, on the operations a cursor pages through, async iteration over the rows of
 * every page. The call is sent when it is first awaited or iterated, once: awaiting it again, or asking for
 * `.withMeta()` after, reads the same answer. `request` and `requestOperation` keep returning the whole answer.
 */

import { OPERATIONS, type OperationId, type TextOperationId } from './generated/operations';
import type { PagedOperationId } from './generated/namespaces';
import type { OperationDefinition } from './operation';
import type { ApiResult, ApiTextResult, BodyOf, DataOf, EnvelopeOf, JsonObject, OperationAnswer, OperationRequestParams, ProjectionPart, QueryParamsOf } from './types';

/*----------------------------------
- TYPES
----------------------------------*/

type QueryOptions<Id extends OperationId> = [QueryParamsOf<Id>] extends [never] ? unknown : Omit<QueryParamsOf<Id>, 'fields' | 'include'>;
type BodyOptions<Id extends OperationId> = [BodyOf<Id>] extends [never] ? unknown : BodyOf<Id>;
type PagedOptions<Id extends OperationId> = Id extends PagedOperationId
    ? {
        /** Stops a loop over rows or pages after this many rows. `limit` stays the size of a page. */
        maxRows?: number;
    }
    : unknown;

/**
 * The options object of a namespaced method: the operation's query parameters and body properties side by side, plus
 * the abort signal and extra headers. `format` and `ifNoneMatch` are `request`'s: their answers carry no `data`.
 */
export type CallOptions<Id extends OperationId> = QueryOptions<Id> & BodyOptions<Id> & ProjectionPart<Id> & PagedOptions<Id> & {
    signal?: AbortSignal;
    headers?: Readonly<Record<string, string>>;
};

/** One row of a paged operation: the item of its list. An answer that is not a list has no rows. */
export type RowOf<Id extends OperationId> = Extract<DataOf<Id>, readonly unknown[]>[number];

/** The call a method returns for an operation: a string for a file, rows for a paged list, `data` otherwise. */
export type OperationCall<Id extends OperationId> = Id extends TextOperationId
    ? ApiCall<string, ApiTextResult>
    : Id extends PagedOperationId
        ? PagedApiCall<RowOf<Id>, DataOf<Id>, ApiResult<EnvelopeOf<Id>>>
        : ApiCall<DataOf<Id>, ApiResult<EnvelopeOf<Id>>>;

type RequestOperation = (operationId: OperationId, params?: OperationRequestParams) => Promise<OperationAnswer>;
type FetchAnswer = (cursor?: string) => Promise<OperationAnswer>;

/*----------------------------------
- HELPERS
----------------------------------*/

/** A namespaced call sends no `If-None-Match`, so a 304 can only come from something between the caller and the API. */
const readData = (answer: OperationAnswer): unknown => {
    if (answer.notModified) throw new TypeError('The answer is a 304 to a call that sent no ETag: something between you and the API answered it.');
    return 'text' in answer ? answer.text : answer.data;
};

/** The options object splits by the operation's own table: a body property goes in the body, the rest in the query. */
const toRequestParams = (operation: OperationDefinition, args: readonly unknown[], cursor: string | undefined): OperationRequestParams => {
    const pathParams = operation.parameters.filter((param) => param.in === 'path');
    const path = Object.fromEntries(pathParams.map((param, index) => [param.name, args[index] as string | number]));
    const { signal, headers, fields, include, maxRows: _maxRows, ...rest } = (args[pathParams.length] ?? {}) as Record<string, unknown> & OperationRequestParams & { maxRows?: number };
    const bodyKeys = new Set(operation.body?.properties.map((property) => property.name));
    const body: Record<string, unknown> = {};
    const query: Record<string, string | number | boolean | undefined> = {};
    for (const [key, value] of Object.entries(rest)) {
        if (bodyKeys.has(key)) body[key] = value;
        else query[key] = value as string | number | boolean | undefined;
    }
    if (cursor !== undefined) query.cursor = cursor;
    return {
        path,
        query,
        // `check_name` requires a body whose properties are all optional: `{}` asks for the default lanes.
        ...(operation.body && (operation.body.required || Object.keys(body).length > 0) ? { body: body as JsonObject } : {}),
        ...(fields !== undefined ? { fields } : {}),
        ...(include !== undefined ? { include } : {}),
        ...(signal ? { signal } : {}),
        ...(headers ? { headers } : {}),
    };
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export class ApiCall<T, TResult> implements PromiseLike<T> {
    #answer: Promise<OperationAnswer> | null = null;
    protected readonly fetchAnswer: FetchAnswer;

    constructor(fetchAnswer: FetchAnswer) {
        this.fetchAnswer = fetchAnswer;
    }

    get [Symbol.toStringTag](): string {
        return 'ApiCall';
    }

    protected firstAnswer(): Promise<OperationAnswer> {
        this.#answer ??= this.fetchAnswer();
        return this.#answer;
    }

    /** The whole answer: `data`, `meta`, `links` and the header facts (`headers`, `etag`, `quota`, `rateLimit`, ...). */
    withMeta(): Promise<TResult> {
        // The method's type names the operation's answer; this class only reads what every answer has.
        return this.firstAnswer() as Promise<TResult>;
    }

    then<TOk = T, TFailed = never>(onOk?: ((value: T) => TOk | PromiseLike<TOk>) | null, onFailed?: ((reason: unknown) => TFailed | PromiseLike<TFailed>) | null): Promise<TOk | TFailed> {
        return this.firstAnswer().then((answer) => readData(answer) as T).then(onOk, onFailed);
    }

    catch<TFailed = never>(onFailed?: ((reason: unknown) => TFailed | PromiseLike<TFailed>) | null): Promise<T | TFailed> {
        return this.then(undefined, onFailed);
    }

    finally(onSettled?: (() => void) | null): Promise<T> {
        return this.then().finally(onSettled);
    }
}

export class PagedApiCall<TRow, T, TResult> extends ApiCall<T, TResult> implements AsyncIterable<TRow> {
    readonly #maxRows: number | undefined;

    constructor(fetchAnswer: FetchAnswer, maxRows: number | undefined) {
        super(fetchAnswer);
        this.#maxRows = maxRows;
    }

    /** Every page in turn, each fetched when the previous one is done. With `maxRows`, the last page comes whole. */
    async *pages(): AsyncGenerator<TResult, void, undefined> {
        const maxRows = this.#maxRows;
        if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 0)) throw new TypeError(`maxRows must be a whole number, 0 or more: ${maxRows}.`);
        if (maxRows === 0) return;
        let seen = 0;
        let answer = await this.firstAnswer();
        for (;;) {
            yield answer as TResult;
            if (answer.notModified || 'text' in answer) return;
            if (Array.isArray(answer.data)) seen += answer.data.length;
            const cursor = answer.meta.cursor;
            if (!cursor || (maxRows !== undefined && seen >= maxRows)) return;
            answer = await this.fetchAnswer(cursor);
        }
    }

    /** Every row of every page. On an answer that is not a list (the free grade of `domains.drops`), throws. */
    async *[Symbol.asyncIterator](): AsyncGenerator<TRow, void, undefined> {
        let seen = 0;
        for await (const page of this.pages()) {
            const rows = readData(page as OperationAnswer);
            if (!Array.isArray(rows)) throw new TypeError('This answer is a summary, not a list of rows: await the call to read it.');
            for (const row of rows) {
                if (this.#maxRows !== undefined && seen >= this.#maxRows) return;
                seen++;
                yield row;
            }
        }
    }
}

/** The call behind one namespaced method: `args` are its positional path values, then its options object. */
export const createCall = (operationId: OperationId, args: readonly unknown[], requestOperation: RequestOperation): ApiCall<unknown, unknown> => {
    const operation: OperationDefinition = OPERATIONS[operationId];
    const fetchAnswer: FetchAnswer = (cursor) => requestOperation(operationId, toRequestParams(operation, args, cursor));
    if (!operation.parameters.some((param) => param.in === 'query' && param.name === 'cursor')) return new ApiCall(fetchAnswer);
    const options = args[operation.parameters.filter((param) => param.in === 'path').length] as { maxRows?: number } | undefined;
    return new PagedApiCall(fetchAnswer, options?.maxRows);
};
