/*----------------------------------
- BIN: ud-appraise
----------------------------------*/

import type { DataOf } from '@uniquedomains/sdk';
import { main, onePositional, UsageError } from '../../../shared/usecase/bin';
import { appraisal, appraise, comparableSales } from './index';

declare const __PACKAGE_VERSION__: string;

const noValue = (name: string) => (value: DataOf<'get_name_value'>) => (value.current === null ? `No value is stored for ${name}.` : null);

main({
    bin: 'ud-appraise',
    version: __PACKAGE_VERSION__,
    summary: 'What a domain name may be worth. The comparable sales are free, no key needed; the value needs one.',
    usage: ['<name>', '<name> --value', '<name> --run'],
    flags: [
        { name: 'value', help: 'The stored value and its last estimates. Needs a key.' },
        { name: 'run', help: 'Run the appraisal when the estimate is missing. Needs a key on the Investor plan, and spends one Appraisal unit when it runs.' },
    ],
    listing: 'appraisal',
    plan: (args, connection) => {
        const name = onePositional(args, 'name');
        if (args.flags.value && args.flags.run) throw new UsageError('Choose one of --value, --run.');
        if (args.flags.run) return { call: appraise(name, connection), empty: noValue(name) };
        if (args.flags.value) return { call: appraisal(name, connection), empty: noValue(name) };
        return {
            call: comparableSales(name, connection),
            empty: (sales: DataOf<'get_name_comps'>) => (sales.count === 0 ? `No comparable sales are on record for ${name}.` : null),
        };
    },
});
