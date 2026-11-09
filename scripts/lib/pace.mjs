/*----------------------------------
- PACE: READS IN TURN, WITH A PAUSE BETWEEN THEM
----------------------------------*/

/**
 * What the API's edge allows on `/meta/openapi.json`: the Cloudflare rule of lane S blocks an address after 10 reads in
 * 10 seconds, and `generate` reads the document 17 times in a row. A little over a second apart stays under it, on a
 * fast connection too.
 */
export const READ_PAUSE_MS = 1100;

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Calls `read` on each item in turn, pausing between two reads and not after the last. Answers the results in order. */
export const readInTurn = async (items, read, { pauseMs = READ_PAUSE_MS, sleep = wait } = {}) => {
    const results = [];
    for (const [index, item] of items.entries()) {
        if (index > 0) await sleep(pauseMs);
        results.push(await read(item));
    }
    return results;
};
