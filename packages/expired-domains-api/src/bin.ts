/*----------------------------------
- BIN: ud-expired
----------------------------------*/

import type { ClientOptions, DataOf } from 'domain-name-api';
import { main, UsageError } from '../../../shared/usecase/bin';
import { drops, expiring } from './index';

declare const __PACKAGE_VERSION__: string;

/** A connection that carries a key: a member key, or a RapidAPI one. */
const hasKey = (connection: ClientOptions): boolean => Boolean(connection.apiKey || connection.rapidApi);

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
        if (args.flags.ending === true) throw new UsageError('--ending takes a value: <endings>.');
        if (args.flags.expiring) {
            if (args.flags.day !== undefined) throw new UsageError('--day goes with the drops, not --expiring: bound the expiry with --after and --before.');
            const after = typeof args.flags.after === 'string' ? args.flags.after : undefined;
            const before = typeof args.flags.before === 'string' ? args.flags.before : undefined;
            return { call: expiring({ ...connection, ending, after, before }), nextPage: 'list-expiring-domains' };
        }
        if (args.flags.after !== undefined || args.flags.before !== undefined) throw new UsageError('--after and --before go with --expiring.');
        const day = typeof args.flags.day === 'string' ? args.flags.day : undefined;
        return {
            call: drops({ ...connection, day, ending }),
            nextPage: 'get-domain-drops',
            empty: (answer: DataOf<'get_domain_drops'>) => (!Array.isArray(answer) && answer.count === 0 ? `No names drop on ${day ?? 'this day'}.` : null),
            // Without a key the answer is the day's counts over every ending: `ending` narrows the names only.
            note: ending !== undefined && !hasKey(connection) ? 'With no key the counts cover every ending: --ending narrows the names, with a key on the Investor plan.' : undefined,
        };
    },
});
