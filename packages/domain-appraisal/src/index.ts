/*----------------------------------
- @uniquedomains/domain-appraisal
----------------------------------*/

/** What a name may be worth: free comparable sales, the stored value and a fresh appraisal with a key. */

import type { CallOptions, OperationCall } from '@uniquedomains/sdk';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from '@uniquedomains/sdk';
export type { ConnectionOptions };

/**
 * A summary of the sales behind a name: which sales it draws on (`tier`), their count and median in USD, and the endings
 * the word sold on in 12 months. Free. Aggregates only, never a single sale.
 *
 * @example
 * const sales = await comparableSales('get.plumbing');
 */
export const comparableSales = (name: string, options?: ConnectionOptions & CallOptions<'get_name_comps'>): OperationCall<'get_name_comps'> => {
    const { ud, call } = connect(options);
    return ud.names.comps(name, call);
};

/**
 * A name's stored value and its last 20 estimates; `current` is null when none is stored. Needs a key. Never runs an
 * appraisal: `appraise` does.
 *
 * @example
 * const value = await appraisal('get.plumbing', { apiKey: process.env.UD_API_KEY });
 */
export const appraisal = (name: string, options?: ConnectionOptions & CallOptions<'get_name_value'>): OperationCall<'get_name_value'> => {
    const { ud, call } = connect(options);
    return ud.names.value(name, call);
};

/**
 * Runs the appraisal of a stored name when its estimate is missing, and answers the value. Needs a key on the Investor
 * plan, and spends one Appraisal unit when this call starts a run; a fresh estimate spends none. When another call holds
 * the run, the answer is what is stored so far, so `current` may be null: `.withMeta()` then carries status 202.
 *
 * @example
 * const value = await appraise('get.plumbing', { apiKey: process.env.UD_API_KEY });
 */
export const appraise = (name: string, options?: ConnectionOptions & CallOptions<'appraise_name'>): OperationCall<'appraise_name'> => {
    const { ud, call } = connect(options);
    return ud.names.appraise(name, call);
};
