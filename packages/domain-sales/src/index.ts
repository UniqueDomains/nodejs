/*----------------------------------
- domain-sales
----------------------------------*/

/** How many domain names sold and at what median price: the whole market, by ending, by length, by word. */

import type { CallOptions, OperationCall } from 'domain-name-api';
import { connect, type ConnectionOptions } from '../../../shared/usecase/connection';

export { ApiProblemError, createClient, NotFoundError, PlanRequiredError, QuotaError, RateLimitError, ValidationError } from 'domain-name-api';
export type { ConnectionOptions };

/*----------------------------------
- PUBLIC API
----------------------------------*/

/**
 * The market's sales over 7 days, 30 days and 12 months, each with its count and median price, the sales by price band
 * over 30 days and 12 months, and how many names that sold before can be registered or bought today. Free.
 *
 * @example
 * const pulse = await salesPulse();
 */
export const salesPulse = (options?: ConnectionOptions & CallOptions<'get_market_sales'>): OperationCall<'get_market_sales'> => {
    const { ud, call } = connect(options);
    return ud.market.sales(call);
};

/**
 * Each ending's sales over 12 months and 30 days, with its count, its median price and the 12 months before, in
 * alphabetical order. An ending shows from three sales in 12 months. Free.
 *
 * @example
 * const endings = await salesByEnding();
 */
export const salesByEnding = (options?: ConnectionOptions & CallOptions<'list_market_sales_endings'>): OperationCall<'list_market_sales_endings'> => {
    const { ud, call } = connect(options);
    return ud.market.salesEndings(call);
};

/**
 * Sales by name length on .com, .ai, .io and .co. Free.
 *
 * @example
 * const lengths = await salesByLength();
 */
export const salesByLength = (options?: ConnectionOptions & CallOptions<'get_market_sales_lengths'>): OperationCall<'get_market_sales_lengths'> => {
    const { ud, call } = connect(options);
    return ud.market.salesLengths(call);
};

/**
 * Up to ten words whose sales moved over the last 30 days. Free.
 *
 * @example
 * const movers = await salesMovers();
 */
export const salesMovers = (options?: ConnectionOptions & CallOptions<'list_market_sales_movers'>): OperationCall<'list_market_sales_movers'> => {
    const { ud, call } = connect(options);
    return ud.market.salesMovers(call);
};

/**
 * The sales of each day, week or month (`kind`), oldest first, with the count, the mean and the median. Free.
 *
 * @example
 * const months = await salesSeries({ kind: 'month' });
 */
export const salesSeries = (options?: ConnectionOptions & CallOptions<'list_market_sales_series'>): OperationCall<'list_market_sales_series'> => {
    const { ud, call } = connect(options);
    return ud.market.salesSeries(call);
};

/**
 * One word's sales over 12 months: how many, the median price, how many endings it sold on and the month of its last
 * sale. Free, one word a day per address: the same word again is answered, another throws a `RateLimitError` until the
 * next UTC day; RapidAPI's free Basic plan reads one word a day per subscription. A member key or a paid RapidAPI plan
 * reads any number of words.
 *
 * @example
 * const word = await salesOfWord('harbor');
 */
export const salesOfWord = (word: string, options?: ConnectionOptions & CallOptions<'get_market_sales_word'>): OperationCall<'get_market_sales_word'> => {
    const { ud, call } = connect(options);
    return ud.market.salesWord(word, call);
};
