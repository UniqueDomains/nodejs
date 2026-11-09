/*----------------------------------
- CONNECTION: THE OPTIONS OF A USE-CASE FUNCTION
----------------------------------*/

/**
 * Bundled into each use-case package by its build (a relative import), so this folder is never published on its own.
 * Every function of those packages takes one options object: how to connect (a key, a RapidAPI subscription, a client
 * already made) and what to ask (the operation's own options). `connect` splits the two.
 */

import { createClient, type ClientOptions, type UniqueDomainsClient } from '@uniquedomains/sdk';

/*----------------------------------
- TYPES
----------------------------------*/

export type ConnectionOptions = ClientOptions & {
    /** A client already made with `createClient`: reuses it. It carries its own key and base, so only `headers` may come beside it. */
    client?: UniqueDomainsClient;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** The client to call with, and the options that belong to the call. A key defaults to `UD_API_KEY`, as in the SDK. */
export const connect = <T extends ConnectionOptions>(options: T | undefined) => {
    const { client, apiKey, rapidApi, baseUrl, headers, fetch, userAgent, retry, ...call } = (options ?? {}) as T;
    const beside = Object.entries({ apiKey, rapidApi, baseUrl, fetch, userAgent, retry }).filter(([, value]) => value !== undefined).map(([name]) => name);
    if (client && beside.length > 0) throw new TypeError(`Pass either client or ${beside.join(', ')}, not both: the client carries its own.`);
    const connection: ClientOptions = {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(rapidApi !== undefined ? { rapidApi } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(headers !== undefined ? { headers } : {}),
        ...(fetch !== undefined ? { fetch } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(retry !== undefined ? { retry } : {}),
    };
    // With a client already made, `headers` can only go on this call: the other connection options are the client's.
    const callHeaders = client && headers !== undefined ? { headers } : {};
    return { ud: client ?? createClient(connection), call: { ...call, ...callHeaders } as Omit<T, keyof ConnectionOptions> };
};
