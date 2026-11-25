/*----------------------------------
- expired-domains-api
----------------------------------*/

/** The names in their last days before they come free, and the names nearing their expiry date or past it. */

import type { CallOptions, OperationCall } from 'domain-name-api';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';
import { endingsOf, type Endings } from './endings';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from 'domain-name-api';
export type { ConnectionOptions, Endings };

/*----------------------------------
- TYPES
----------------------------------*/

export type DropsOptions = Omit<CallOptions<'get_domain_drops'>, 'ending'> & { ending?: Endings };

export type ExpiringOptions = Omit<CallOptions<'list_expiring_domains'>, 'ending'> & { ending?: Endings };

/*----------------------------------
- HELPERS
----------------------------------*/

/** The call's options with `ending` written as the API reads it, and left out when it names none. */
const withEndings = <T extends { ending?: Endings }>(call: T): Omit<T, 'ending'> & { ending?: string } => {
    const { ending, ...rest } = call;
    const endings = ending === undefined ? '' : endingsOf(ending);
    return endings ? { ...rest, ending: endings } : rest;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

/**
 * The names dropping on one day, today by default; `day` runs from today (UTC) to six days ahead. Free: how many names
 * drop, the split by ending and the ending and drop day of five of them, never a name. With a key on the Investor plan,
 * or a paid RapidAPI subscription, the names themselves, which `ending` narrows, and a loop over the call walks the pages.
 *
 * @example
 * const day = await drops();
 */
export const drops = (options?: ConnectionOptions & DropsOptions): OperationCall<'get_domain_drops'> => {
    const { ud, call } = connect(options);
    return ud.domains.drops(withEndings(call));
};

/**
 * The names nearing their expiry date or past it, soonest first, each with its drop day once it is set. `ending`
 * narrows them, `after` and `before` bound the expiry day, and a loop over the call walks the pages. Needs a key on the Investor plan, or a paid RapidAPI subscription.
 *
 * @example
 * const names = await expiring({ ending: 'io', apiKey: process.env.UD_API_KEY });
 */
export const expiring = (options?: ConnectionOptions & ExpiringOptions): OperationCall<'list_expiring_domains'> => {
    const { ud, call } = connect(options);
    return ud.domains.expiring(withEndings(call));
};
