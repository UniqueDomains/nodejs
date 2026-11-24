/*----------------------------------
- BIN: ud-expired
----------------------------------*/

import type { DataOf } from 'domain-name-api';
import { main, UsageError } from '../../../shared/usecase/bin';
import { endingsOf } from './endings';
import { drops, expiring } from './index';

declare const __PACKAGE_VERSION__: string;

/**
 * The `ud` command that reads the next page: the API's cursor holds the sort key only, so the filters go with it, the
 * endings written as the API reads them.
 */
const nextPageOf = (command: string, filters: Readonly<Record<string, string | undefined>>): string => {
    const flags = Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]));
    return [command, ...flags.map(([flag, value]) => `--${flag} ${value}`)].join(' ');
};

main({
    bin: 'ud-expired',
    version: __PACKAGE_VERSION__,
    summary: 'The domain names dropping each day, by ending. The day\'s counts are free, no key needed; the names and --expiring need one.',
    usage: ['', '--day <day> --ending <endings>', '--expiring --ending <endings>'],
    runsWithoutArguments: true,
    flags: [
        { name: 'day', value: '<day>', help: 'The drop day, YYYY-MM-DD, from today (UTC) to six days ahead. Defaults to today.' },
        { name: 'ending', value: '<endings>', help: 'Endings, comma-separated. They narrow the names, with a key on the Investor plan.' },
        { name: 'expiring', help: 'The names at or past their expiry date, soonest first. Needs a key on the Investor plan.' },
        { name: 'after', value: '<day>', help: 'With --expiring: an expiry on or after this day.' },
        { name: 'before', value: '<day>', help: 'With --expiring: an expiry before this day.' },
    ],
    listing: 'expired',
    plan: (args, connection) => {
        if (args.positionals.length > 0) throw new UsageError('ud-expired takes no argument: the day goes in --day, the endings in --ending.');
        const ending = typeof args.flags.ending === 'string' ? args.flags.ending : undefined;
        const endings = ending === undefined ? undefined : endingsOf(ending) || undefined;
        if (args.flags.expiring) {
            if (args.flags.day !== undefined) throw new UsageError('--day goes with the drops, not --expiring: bound the expiry with --after and --before.');
            const after = typeof args.flags.after === 'string' ? args.flags.after : undefined;
            const before = typeof args.flags.before === 'string' ? args.flags.before : undefined;
            return { call: expiring({ ...connection, ending, after, before }), nextPage: nextPageOf('list-expiring-domains', { ending: endings, after, before }) };
        }
        if (args.flags.after !== undefined || args.flags.before !== undefined) throw new UsageError('--after and --before go with --expiring.');
        const day = typeof args.flags.day === 'string' ? args.flags.day : undefined;
        return {
            call: drops({ ...connection, day, ending }),
            nextPage: nextPageOf('get-domain-drops', { day, ending: endings }),
            empty: (answer: DataOf<'get_domain_drops'>) => (!Array.isArray(answer) && answer.count === 0 ? `No names drop on ${day ?? 'this day'}.` : null),
            // The day's counts came back although an ending was asked: no key, or a free RapidAPI plan, reads no ending.
            note: (answer: DataOf<'get_domain_drops'>) => (endings !== undefined && !Array.isArray(answer) ? 'With no key the counts cover every ending: --ending narrows the names, with a key on the Investor plan.' : null),
        };
    },
});
