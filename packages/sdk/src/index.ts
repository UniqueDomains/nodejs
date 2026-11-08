/*----------------------------------
- @uniquedomains/sdk
----------------------------------*/

/**
 * The public surface. The MCP server (`@uniquedomains/mcp-server`) consumes it, so every export here is a contract:
 * `createClient`, the two errors, the generated operation and listing tables, and the types.
 */

export { createClient, SDK_VERSION } from './client';
export type { AuthMode, ClientOptions, UniqueDomainsClient } from './client';
export { ApiProblemError, ListingMismatchError } from './errors';
export { parseQuota, parseRateLimit, parseRetryAfter } from './headers';
export { findListing, isListingId, isOperationId, listingServes, listingsServing } from './listing';
export type { ListingDefinition } from './listing';
export { API_DOCUMENT_VERSION, API_PUBLIC_BASE, OPERATIONS, TAGS } from './generated/operations';
export type { CsvOperationId, OperationId, TextOperationId } from './generated/operations';
export { LISTINGS } from './generated/listings';
export type { ListingId } from './generated/listings';
export type { BodyProperty, OperationDefinition, OperationParameter, ParameterType, TagDefinition } from './operation';
export type { components, operations, paths } from './generated/schema';
export type {
    AnswerOf,
    ApiAnswerFacts,
    ApiEnvelope,
    ApiLinks,
    ApiMeta,
    ApiNotModified,
    ApiProblem,
    ApiProblemCode,
    ApiQuota,
    ApiRateLimit,
    ApiResult,
    ApiTextResult,
    BodyOf,
    DataOf,
    EnvelopeOf,
    ExactParams,
    ListOption,
    OperationAnswer,
    OperationRequestParams,
    ProblemCode,
    JsonObject,
    JsonPrimitive,
    JsonValue,
    PathParamsOf,
    QueryParamsOf,
    RequestArgs,
    RequestOptions,
    RequestParams,
} from './types';
