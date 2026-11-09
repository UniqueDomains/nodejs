/*----------------------------------
- @uniquedomains/domain-availability
----------------------------------*/

/** Whether a name can be registered: the stored answer, the live check and many names at once. */

import type { ApiCall, ApiResult, CallOptions, DataOf, EnvelopeOf, OperationCall } from '@uniquedomains/sdk';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from '@uniquedomains/sdk';
export type { ConnectionOptions };

/*----------------------------------
- TYPES
----------------------------------*/

/** The fields `availability` asks for, and all its answer holds. */
export const AVAILABILITY_FIELDS = ['name', 'tracked', 'status', 'lifecycle', 'drop', 'ownableNow', 'price'] as const;

export type Availability = Pick<DataOf<'get_name'>, (typeof AVAILABILITY_FIELDS)[number]>;

export type BatchOptions = ConnectionOptions & Omit<CallOptions<'batch_names'>, 'names'>;

/*----------------------------------
- CONSTANTS
----------------------------------*/

/** What one `availabilityBatch` call takes: billed per name sent, so more is refused before any call. */
export const MAX_BATCH_NAMES = 100;

/*----------------------------------
- PUBLIC API
----------------------------------*/

/**
 * A name's stored status, drop day, price and renewal. Free, read from storage, never live. A name the catalog never
 * stored answers `tracked: false` and `status: 'not_checked'`, never an error.
 *
 * @example
 * const answer = await availability('get.plumbing');
 */
export const availability = (name: string, options?: ConnectionOptions & Omit<CallOptions<'get_name'>, 'fields'>): ApiCall<Availability, ApiResult<EnvelopeOf<'get_name'>>> => {
    const { ud, call } = connect(options);
    return ud.names.get(name, { ...call, fields: AVAILABILITY_FIELDS });
};

/**
 * Reads a name live from its registry and a registrar, stores the answer and returns it. Needs a key, and spends one
 * Live unit when the live read runs.
 *
 * @example
 * const answer = await check('get.plumbing', { apiKey: process.env.UD_API_KEY });
 */
export const check = (name: string, options?: ConnectionOptions & CallOptions<'check_name'>): OperationCall<'check_name'> => {
    const { ud, call } = connect(options);
    return ud.names.check(name, call);
};

/**
 * The stored answer for up to 100 names, in the order sent, each with the keyed fields. Needs a key on the Investor
 * plan, and is billed one call per name sent. No live read.
 *
 * @example
 * const answers = await availabilityBatch(['get.plumbing', 'domain.recipes'], { apiKey: process.env.UD_API_KEY });
 */
export const availabilityBatch = (names: readonly string[], options?: BatchOptions): OperationCall<'batch_names'> => {
    if (!Array.isArray(names)) throw new TypeError('availabilityBatch takes a list of names.');
    if (names.length === 0 || names.length > MAX_BATCH_NAMES) throw new RangeError(`availabilityBatch takes 1 to ${MAX_BATCH_NAMES} names, not ${names.length}.`);
    const { ud, call } = connect(options);
    return ud.names.batch({ ...call, names: [...names] });
};
