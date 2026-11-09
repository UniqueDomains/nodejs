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
    /** A client already made with `createClient`: reuses it, and the other connection options are ignored. */
    client?: UniqueDomainsClient;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** The client to call with, and the options that belong to the call. A key defaults to `UD_API_KEY`, as in the SDK. */
export const connect = <T extends ConnectionOptions>(options: T | undefined) => {
    const { client, apiKey, rapidApi, baseUrl, headers, fetch, userAgent, retry, ...call } = (options ?? {}) as T;
    const connection: ClientOptions = {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(rapidApi !== undefined ? { rapidApi } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(headers !== undefined ? { headers } : {}),
        ...(fetch !== undefined ? { fetch } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(retry !== undefined ? { retry } : {}),
    };
    return { ud: client ?? createClient(connection), call: call as Omit<T, keyof ConnectionOptions> };
};
