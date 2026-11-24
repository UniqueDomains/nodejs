/*----------------------------------
- domain-auctions
----------------------------------*/

/** The domain names at auction: the day's closings and bids, the venues' rules, one name's auction and past outcomes. */

import type { CallOptions, OperationCall } from 'domain-name-api';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from 'domain-name-api';
export type { ConnectionOptions };

/*----------------------------------
- PUBLIC API
----------------------------------*/

/**
 * The day's auctions: how many names close and how many have a bid, by venue, ending and name length, the closings of
 * the next seven days and the counts of the names Unique.domains tracks. Free.
 *
 * @example
 * const day = await auctions();
 */
export const auctions = (options?: ConnectionOptions & CallOptions<'get_market_auctions'>): OperationCall<'get_market_auctions'> => {
    const { ud, call } = connect(options);
    return ud.market.auctions(call);
};

/**
 * The day's sample: up to 20 one-word names closing that day, by deadline, each with its venue, its deadline and its
 * bid. Drawn once a day, the same for every caller. Free.
 *
 * @example
 * const names = await auctionSample();
 */
export const auctionSample = (options?: ConnectionOptions & CallOptions<'list_market_auctions_sample'>): OperationCall<'list_market_auctions_sample'> => {
    const { ud, call } = connect(options);
    return ud.market.auctionsSample(call);
};

/**
 * The seven auction venues, each with its rules (how an auction closes, when to pay, who may bid) and the day's counts.
 * Free.
 *
 * @example
 * const venues = await auctionVenues();
 */
export const auctionVenues = (options?: ConnectionOptions & CallOptions<'list_market_auction_venues'>): OperationCall<'list_market_auction_venues'> => {
    const { ud, call } = connect(options);
    return ud.market.auctionVenues(call);
};

/**
 * The open auction of one name: its venue, deadline, bid, bid count and first-year cost. `null` when the name has no
 * open auction. Free.
 *
 * @example
 * const auction = await auctionOf('get.plumbing');
 */
export const auctionOf = (name: string, options?: ConnectionOptions & CallOptions<'get_name_auction'>): OperationCall<'get_name_auction'> => {
    const { ud, call } = connect(options);
    return ud.names.auction(name, call);
};

/**
 * How confirmed auctions ended: per venue, day and currency, the count and the median amount, newest day first. `venue`
 * keeps one venue, and a loop over the call walks the pages. Needs a key on the Investor plan.
 *
 * @example
 * const outcomes = await auctionOutcomes({ apiKey: process.env.UD_API_KEY });
 */
export const auctionOutcomes = (options?: ConnectionOptions & CallOptions<'list_market_auction_outcomes'>): OperationCall<'list_market_auction_outcomes'> => {
    const { ud, call } = connect(options);
    return ud.market.auctionOutcomes(call);
};
