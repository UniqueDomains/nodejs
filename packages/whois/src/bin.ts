/*----------------------------------
- BIN: ud-whois
----------------------------------*/

/** `ud-whois`, never `whois`: a bin of that name would shadow the system's command (plan decision 18). */

import type { DataOf } from '@uniquedomains/sdk';
import { main, onePositional } from '../../../shared/usecase/bin';
import { whois, whoisHistory } from './index';

declare const __PACKAGE_VERSION__: string;

main({
    bin: 'ud-whois',
    version: __PACKAGE_VERSION__,
    summary: 'A domain name\'s registry record. Free, no key needed; --history needs one.',
    usage: ['<name>', '<name> --history'],
    flags: [{ name: 'history', help: 'The past records and what moved between them. Needs a key on the Investor plan.' }],
    listing: 'whois',
    plan: (args, connection) => {
        const name = onePositional(args, 'name');
        if (args.flags.history) return { call: whoisHistory(name, connection) };
        return {
            call: whois(name, connection),
            empty: (record: DataOf<'get_name_registry'>) => (!record.read && record.nameservers.length === 0 ? `No registry record is stored for ${name}.` : null),
        };
    },
});
