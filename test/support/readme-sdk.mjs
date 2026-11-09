/*----------------------------------
- THE SDK AS THE README EXAMPLES SEE IT
----------------------------------*/

/**
 * The generated README modules import the SDK from here, so the same `createClient()` a README writes calls the
 * fixture server under `npm test` and the live free tier under `npm run examples:live`. Both call without a key unless
 * the example passes one (`apiKey: process.env.UD_API_KEY` included). Everything else is the built SDK unchanged.
 */

import { createClient as createSdkClient } from '../../packages/sdk/dist/index.js';

export * from '../../packages/sdk/dist/index.js';

let target;

/** `{ base, origin }` of a fixture server, or null for the live API. Until one is set, an example refuses to call. */
export const useTarget = (next) => { target = next; };

/**
 * Live: keyless unless the example passes a key itself; never a key from the environment of the run. Fixture: the same,
 * so a README call that needs a key shows it, on the fixture server.
 */
export const connectionForReadme = (options = {}) => {
    if (target === undefined) throw new Error('No target: call useTarget first. A README example never reaches the live API by accident.');
    return target
        ? { apiKey: null, ...options, baseUrl: options.rapidApi ? target.origin : target.base }
        : { apiKey: null, ...options };
};

export const createClient = (options = {}) => createSdkClient(connectionForReadme(options));
