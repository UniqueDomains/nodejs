/*----------------------------------
- @uniquedomains/sdk
----------------------------------*/

/**
 * The public surface. The MCP server (`@uniquedomains/mcp-server`) consumes it, so every export here is a contract:
 * `createClient`, the errors, the generated operation, listing and namespace tables, and the types.
 */

export { createClient, SDK_VERSION } from './client';
export type { AuthMode, ClientOptions, UniqueDomainsClient } from './client';
export { ApiCall, PagedApiCall } from './call';
export type { CallOptions, OperationCall, RowOf } from './call';
export { ApiProblemError, AuthError, ListingMismatchError, NotFoundError, NotReadyError, PlanRequiredError, QuotaError, RateLimitError, ValidationError, WordRejectedError } from './errors';
export type { RetryOptions } from './retry';
export { parseQuota, parseRateLimit, parseRetryAfter } from './headers';
export { findListing, isListingId, isOperationId, listingServes, listingsServing } from './listing';
export type { ListingDefinition } from './listing';
export { API_DOCUMENT_VERSION, API_PUBLIC_BASE, OPERATIONS, TAGS } from './generated/operations';
export type { CsvOperationId, OperationId, TextOperationId } from './generated/operations';
export { NAMESPACE_METHODS } from './generated/namespaces';
export type { NamespacedClient, PagedOperationId } from './generated/namespaces';
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
    ProjectionPart,
    QueryParamsOf,
    RequestArgs,
    RequestOptions,
    RequestParams,
} from './types';
