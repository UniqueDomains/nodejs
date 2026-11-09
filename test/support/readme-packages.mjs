/*----------------------------------
- THE USE-CASE PACKAGES AS THE README EXAMPLES SEE THEM
----------------------------------*/

/**
 * A package's function takes its connection in its last parameter. This fills it as `createClient` of `readme-sdk.mjs`
 * does: keyless unless the example passes a key, and on the fixture server under `npm test`.
 */

import { connectionForReadme } from './readme-sdk.mjs';

export const forReadme = (fn) => {
    const last = fn.length - 1;
    if (last < 0) throw new Error(`${fn.name} takes no options parameter`);
    return (...args) => {
        const filled = [...args];
        filled[last] = connectionForReadme(filled[last]);
        return fn(...filled);
    };
};

/** The module a README's `from '@uniquedomains/<package>'` becomes: every function wrapped, every class as it is. */
export const wrapAll = (module) => Object.fromEntries(Object.entries(module).map(([name, value]) => [
    name,
    typeof value === 'function' && !/^[A-Z]/.test(name) && name !== 'createClient' ? forReadme(value) : value,
]));
