/*----------------------------------
- BIN: ud-prices
----------------------------------*/

import { main, onePositional, UsageError, type BinArgs } from '../../../shared/usecase/bin';
import { cheapest, priceChanges, priceHistory, pricesForTld, renewalTraps } from './index';

declare const __PACKAGE_VERSION__: string;

const HISTORY_LISTING = 'registrars' as const;

const takesNoEnding = (args: BinArgs, flag: string): void => {
    if (args.positionals.length > 0) throw new UsageError(`--${flag} takes no ending.`);
};

main({
    bin: 'ud-prices',
    version: __PACKAGE_VERSION__,
    summary: 'What registrars charge for a domain ending. Prices, traps and changes are free, no key needed; --cheapest and --history need one.',
    usage: ['<ending>', '--traps', '--changes', '--cheapest <endings>', '<ending> --history'],
    flags: [
        { name: 'traps', help: 'Endings whose cheapest first year renews at a trap price.' },
        { name: 'changes', help: 'The newest confirmed price changes.' },
        { name: 'cheapest', value: '<endings>', help: 'The cheapest registrar per ending, comma-separated. Needs a key.' },
        { name: 'history', help: 'How the ending\'s prices changed. Needs a key on the Investor plan; a RapidAPI key goes to the Registrar Prices listing.' },
    ],
    listing: 'price-comparison',
    plan: (args, connection) => {
        const modes = ['traps', 'changes', 'cheapest', 'history'].filter((flag) => args.flags[flag]);
        if (modes.length > 1) throw new UsageError(`Choose one of ${modes.map((flag) => `--${flag}`).join(', ')}.`);
        if (args.flags.traps) {
            takesNoEnding(args, 'traps');
            return { call: renewalTraps(connection), nextPage: 'list-price-traps' };
        }
        if (args.flags.changes) {
            takesNoEnding(args, 'changes');
            return { call: priceChanges(connection), nextPage: 'list-price-changes' };
        }
        if (typeof args.flags.cheapest === 'string') {
            takesNoEnding(args, 'cheapest');
            const tlds = args.flags.cheapest.split(',').map((tld) => tld.trim()).filter(Boolean);
            return { call: cheapest(tlds, connection) };
        }
        const tld = onePositional(args, 'ending');
        if (args.flags.history) {
            // The history is on the Registrar Prices listing, not this package's focused one.
            const onHistoryListing = connection.rapidApi ? { ...connection, rapidApi: { ...connection.rapidApi, listing: HISTORY_LISTING } } : connection;
            return { call: priceHistory(tld, onHistoryListing), nextPage: `list-tld-price-history ${tld}`, connection: onHistoryListing };
        }
        return { call: pricesForTld(tld, connection) };
    },
});
