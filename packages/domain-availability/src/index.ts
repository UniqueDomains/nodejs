/*----------------------------------
- @uniquedomains/domain-availability
----------------------------------*/

/** Whether a name can be registered: the answer, the live check and many names at once. */

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
 * A name's status, drop day, price and renewal. Free. A name outside the catalog answers `tracked: false` and
 * `status: 'not_checked'`, never an error; that status also covers a taken name the catalog does not track, so it
 * never means the name is free.
 *
 * @example
 * const answer = await availability('get.plumbing');
 */
export const availability = (name: string, options?: ConnectionOptions & Omit<CallOptions<'get_name'>, 'fields'>): ApiCall<Availability, Omit<ApiResult<EnvelopeOf<'get_name'>>, 'data'> & { data: Availability }> => {
    const { ud, call } = connect(options);
    return ud.names.get(name, { ...call, fields: AVAILABILITY_FIELDS });
};

/**
 * Runs a live check of a name and returns the full answer. Needs a key, and spends one Live unit when the check runs,
 * also when it did not conclude (status 202).
 *
 * @example
 * const answer = await check('zorbly.io', { apiKey: process.env.UD_API_KEY });
 */
export const check = (name: string, options?: ConnectionOptions & CallOptions<'check_name'>): OperationCall<'check_name'> => {
    const { ud, call } = connect(options);
    return ud.names.check(name, call);
};

/**
 * The answers for up to 100 names, in the order sent, each with the keyed fields. Needs a key on the Investor plan,
 * and is billed one call per name sent. Runs no live check.
 *
 * @example
 * const answers = await availabilityBatch(['zorbly.io', 'zorbly.ai'], { apiKey: process.env.UD_API_KEY });
 */
export const availabilityBatch = (names: readonly string[], options?: BatchOptions): OperationCall<'batch_names'> => {
    if (!Array.isArray(names)) throw new TypeError('availabilityBatch takes a list of names.');
    names.forEach((name, index) => {
        if (typeof name !== 'string') throw new TypeError(`availabilityBatch: entry ${index} is not a name.`);
    });
    if (names.length === 0 || names.length > MAX_BATCH_NAMES) throw new RangeError(`Give 1 to ${MAX_BATCH_NAMES} names, not ${names.length}.`);
    const { ud, call } = connect(options);
    return ud.names.batch({ ...call, names: [...names] });
};
