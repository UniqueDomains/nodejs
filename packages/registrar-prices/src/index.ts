/*----------------------------------
- @uniquedomains/registrar-prices
----------------------------------*/

/** What registrars charge for an ending, where a first year hides a high renewal, and what moved. */

import type { CallOptions, OperationCall } from '@uniquedomains/sdk';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from '@uniquedomains/sdk';
export type { ConnectionOptions };

/*----------------------------------
- CONSTANTS
----------------------------------*/

/** What one `cheapest` call takes. */
export const MAX_CHEAPEST_TLDS = 100;

/*----------------------------------
- HELPERS
----------------------------------*/

/** `.IO` and `io` are one ending. */
const endingOf = (tld: string): string => tld.trim().replace(/^\./, '').toLowerCase();

/*----------------------------------
- PUBLIC API
----------------------------------*/

/**
 * Every registrar's list price for an ending, with the cheapest and renewal-trap marks. Free on the public set of
 * endings; outside it, the free tier reads one ending a UTC day.
 *
 * @example
 * const prices = await pricesForTld('io');
 */
export const pricesForTld = (tld: string, options?: ConnectionOptions & CallOptions<'list_tld_prices'>): OperationCall<'list_tld_prices'> => {
    const { ud, call } = connect(options);
    return ud.prices.tld(endingOf(tld), call);
};

/**
 * Endings whose cheapest first year renews at a trap price, alphabetical. Free: eight rows. A key reads every trap, a
 * loop over the call walks the pages, and `.withMeta()` carries the whole count in `meta.trapCount`.
 *
 * @example
 * const traps = await renewalTraps();
 */
export const renewalTraps = (options?: ConnectionOptions & CallOptions<'list_price_traps'>): OperationCall<'list_price_traps'> => {
    const { ud, call } = connect(options);
    return ud.prices.traps(call);
};

/**
 * Confirmed registrar price changes, newest first. Free: the ten newest. A key adds the filters and the pages.
 *
 * @example
 * const changes = await priceChanges();
 */
export const priceChanges = (options?: ConnectionOptions & CallOptions<'list_price_changes'>): OperationCall<'list_price_changes'> => {
    const { ud, call } = connect(options);
    return ud.prices.changes(call);
};

/**
 * The cheapest registrar for each of up to 100 endings: first year, renewal and transfer, in the order asked. An ending
 * with no price answers its row with nulls. Needs a key.
 *
 * @example
 * const rows = await cheapest(['ai', 'io'], { apiKey: process.env.UD_API_KEY });
 */
export const cheapest = (tlds: readonly string[], options?: ConnectionOptions & Omit<CallOptions<'list_cheapest_prices'>, 'tlds'>): OperationCall<'list_cheapest_prices'> => {
    if (!Array.isArray(tlds)) throw new TypeError('cheapest takes a list of endings.');
    if (tlds.length === 0 || tlds.length > MAX_CHEAPEST_TLDS) throw new RangeError(`cheapest takes 1 to ${MAX_CHEAPEST_TLDS} endings, not ${tlds.length}.`);
    const { ud, call } = connect(options);
    return ud.prices.cheapest({ ...call, tlds: tlds.map(endingOf).join(',') });
};

/**
 * How an ending's prices changed, newest first, optionally for one registrar. Needs a key on the Investor plan, and a
 * loop over the call walks the pages.
 *
 * @example
 * const rows = await priceHistory('io', { apiKey: process.env.UD_API_KEY });
 */
export const priceHistory = (tld: string, options?: ConnectionOptions & CallOptions<'list_tld_price_history'>): OperationCall<'list_tld_price_history'> => {
    const { ud, call } = connect(options);
    return ud.prices.tldHistory(endingOf(tld), call);
};
