/*----------------------------------
- BIN: ud-auctions
----------------------------------*/

import type { DataOf } from 'domain-name-api';
import { main, UsageError, type BinArgs } from '../../../shared/usecase/bin';
import { auctionOf, auctionOutcomes, auctions, auctionSample, auctionVenues } from './index';

declare const __PACKAGE_VERSION__: string;

const takesNoName = (args: BinArgs, flag: string): void => {
    if (args.positionals.length > 0) throw new UsageError(`--${flag} takes no name.`);
};

main({
    bin: 'ud-auctions',
    version: __PACKAGE_VERSION__,
    summary: 'The domain names at auction today. The day, the sample, the venues and one name\'s auction are free, no key needed; --outcomes needs a key on the Investor plan or a paid RapidAPI subscription.',
    usage: ['', '<name>', '--sample', '--venues', '--outcomes'],
    runsWithoutArguments: true,
    flags: [
        { name: 'sample', help: 'Up to 20 one-word names closing today, each with its venue, deadline and bid.' },
        { name: 'venues', help: 'Each venue\'s rules: how an auction closes, when to pay, who may bid.' },
        { name: 'outcomes', help: 'How confirmed auctions ended, by venue and day. Needs a key on the Investor plan, or a paid RapidAPI subscription.' },
    ],
    listing: 'auctions',
    plan: (args, connection) => {
        const modes = ['sample', 'venues', 'outcomes'].filter((flag) => args.flags[flag]);
        if (modes.length > 1) throw new UsageError(`Choose one of ${modes.map((flag) => `--${flag}`).join(', ')}.`);
        if (args.flags.sample) {
            takesNoName(args, 'sample');
            return { call: auctionSample(connection), empty: (rows: DataOf<'list_market_auctions_sample'>) => (rows.length === 0 ? 'No sample yet today.' : null) };
        }
        if (args.flags.venues) {
            takesNoName(args, 'venues');
            return { call: auctionVenues(connection) };
        }
        if (args.flags.outcomes) {
            takesNoName(args, 'outcomes');
            return { call: auctionOutcomes(connection), nextPage: 'list-market-auction-outcomes' };
        }
        const [name, ...rest] = args.positionals;
        if (rest.length > 0) throw new UsageError('Give one name.');
        if (name === undefined) return { call: auctions(connection) };
        return { call: auctionOf(name, connection), empty: (auction: DataOf<'get_name_auction'>) => (auction === null ? `No open auction for ${name}.` : null) };
    },
});
