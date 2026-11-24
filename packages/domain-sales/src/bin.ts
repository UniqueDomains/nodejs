/*----------------------------------
- BIN: ud-sales
----------------------------------*/

import type { ClientOptions, DataOf } from 'domain-name-api';
import { main, UsageError, type BinAction, type BinArgs } from '../../../shared/usecase/bin';
import { salesByEnding, salesByLength, salesMovers, salesOfWord, salesPulse, salesSeries } from './index';

declare const __PACKAGE_VERSION__: string;

/** The endings, the lengths and the movers are on the Domain Market listing, not this package's own. */
const MARKET_LISTING = 'market' as const;

const SERIES_KINDS = ['day', 'week', 'month'] as const;

type EndingRow = DataOf<'list_market_sales_endings'>[number];

/** The connection a RapidAPI key needs for a call on the Domain Market listing; a member key or none is unchanged. */
const onMarketListing = (connection: ClientOptions): ClientOptions => (connection.rapidApi ? { ...connection, rapidApi: { ...connection.rapidApi, listing: MARKET_LISTING } } : connection);

const takesNoArgument = (args: BinArgs, flag: string): void => {
    if (args.positionals.length > 0) throw new UsageError(`--${flag} takes no word or ending.`);
};

/** A spent free word, not a spent window: the API's refusal names "one word a day". */
const isWordOfTheDay = (detail: string): boolean => /\bone word a day\b/i.test(detail);

/** One ending's row among the endings the API answers, `.COM` and `com` alike; null when the ending is not among them. */
const endingAction = (raw: string, connection: ClientOptions): BinAction => {
    const ending = raw.replace(/^\.+/, '').toLowerCase();
    const market = onMarketListing(connection);
    return {
        call: salesByEnding(market),
        connection: market,
        select: (rows: readonly EndingRow[]) => rows.find((row) => row.ending === ending) ?? null,
        empty: (row: EndingRow | null) => (row === null ? `No sales figures for .${ending}: an ending shows here from three sales in 12 months.` : null),
    };
};

main({
    bin: 'ud-sales',
    version: __PACKAGE_VERSION__,
    summary: 'How many domain names sold and at what median price. Free, no key needed: the market, an ending, a word (one a day per address). On a RapidAPI key, an ending, --lengths and --movers go to the Domain Market listing.',
    usage: ['', '.<ending>', '<word>', '--lengths', '--movers', '--series <day|week|month>'],
    runsWithoutArguments: true,
    flags: [
        { name: 'lengths', help: 'Sales by name length on .com, .ai, .io and .co. A RapidAPI key goes to the Domain Market listing.' },
        { name: 'movers', help: 'Up to ten words whose sales moved over the last 30 days. A RapidAPI key goes to the Domain Market listing.' },
        { name: 'series', value: '<day|week|month>', help: 'The sales of each day, week or month, oldest first.' },
    ],
    listing: 'sales-history',
    plan: (args, connection) => {
        const modes = ['lengths', 'movers', 'series'].filter((flag) => args.flags[flag] !== undefined);
        if (modes.length > 1) throw new UsageError(`Choose one of ${modes.map((flag) => `--${flag}`).join(', ')}.`);
        if (args.flags.lengths) {
            takesNoArgument(args, 'lengths');
            return { call: salesByLength(onMarketListing(connection)), connection: onMarketListing(connection) };
        }
        if (args.flags.movers) {
            takesNoArgument(args, 'movers');
            return { call: salesMovers(onMarketListing(connection)), connection: onMarketListing(connection) };
        }
        if (typeof args.flags.series === 'string') {
            takesNoArgument(args, 'series');
            const kind = SERIES_KINDS.find((entry) => entry === args.flags.series);
            if (!kind) throw new UsageError(`--series takes ${SERIES_KINDS.join(', ')}, not "${args.flags.series}".`);
            return { call: salesSeries({ ...connection, kind }) };
        }
        const [subject, ...rest] = args.positionals;
        if (rest.length > 0) throw new UsageError('Give one word, or one ending with its dot.');
        if (subject === undefined) return { call: salesPulse(connection) };
        if (subject.startsWith('.')) return endingAction(subject, connection);
        return {
            call: salesOfWord(subject, connection),
            empty: (answer: DataOf<'get_market_sales_word'>) => (answer.status === 'none' ? `No sales of "${answer.word}" in 12 months.` : null),
            // RapidAPI's free Basic plan is gated per subscription, a keyless call per address (D11).
            explain: (error) => {
                if (error.status !== 429 || !isWordOfTheDay(error.detail)) return null;
                return connection.rapidApi ? 'On RapidAPI\'s free Basic plan, one subscription reads one word\'s sales a day.' : 'With no key, one address reads one word\'s sales a day.';
            },
        };
    },
});
