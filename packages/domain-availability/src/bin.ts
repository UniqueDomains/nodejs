/*----------------------------------
- BIN: ud-availability
----------------------------------*/

import { main, UsageError } from '../../../shared/usecase/bin';
import { availability, availabilityBatch, check, type Availability } from './index';

declare const __PACKAGE_VERSION__: string;

main({
    bin: 'ud-availability',
    version: __PACKAGE_VERSION__,
    summary: 'Whether a domain name can be registered. The stored answer is free, no key needed; --check and many names need one.',
    usage: ['<name>', '<name> --check', '<name> <name> ...'],
    flags: [{ name: 'check', help: 'Read the name live. Needs a key, and spends one Live unit when the read runs.' }],
    listing: 'availability',
    plan: (args, connection) => {
        const [name, ...others] = args.positionals;
        if (name === undefined) throw new UsageError('Give a name.');
        if (others.length > 0) {
            if (args.flags.check) throw new UsageError('--check takes one name.');
            if (args.positionals.length > 100) throw new UsageError(`Give at most 100 names, not ${args.positionals.length}.`);
            return { call: availabilityBatch(args.positionals, connection) };
        }
        if (args.flags.check) return { call: check(name, connection) };
        return {
            call: availability(name, connection),
            empty: (answer: Availability) => (answer.tracked ? null : `${name} is not in the catalog yet, so no status is stored. --check reads it live, with a key.`),
        };
    },
});
