/*----------------------------------
- TYPE TESTS: THE USE-CASE PACKAGES
----------------------------------*/

/** Checked by `npm run typecheck`, never run: the answers carry the API's types, and a wrong option fails to compile. */

import { appraisal, comparableSales } from 'domain-appraisal';
import { availability, availabilityBatch, check } from 'domain-availability';
import { cheapest, priceHistory, pricesForTld, renewalTraps } from 'registrar-prices';
import { whois, whoisHistory } from '@uniquedomains/whois';
import { drops, expiring } from 'expired-domains-api';
import { salesByEnding, salesOfWord, salesPulse, salesSeries } from 'domain-sales';
import { auctionOf, auctionOutcomes, auctions } from 'domain-auctions';

export const answers = async () => {
    const record = await whois('get.plumbing');
    const read: boolean = record.read;
    const moved: readonly unknown[] = (await whoisHistory('get.plumbing', { apiKey: 'k' })).moves ?? [];

    const stored = await availability('get.plumbing');
    const status: string = stored.status;
    // @ts-expect-error availability's answer holds the fields it asks for, and `length` is not one of them.
    void stored.length;
    // @ts-expect-error the whole answer holds the same fields: `.withMeta()` does not widen them.
    void (await availability('get.plumbing').withMeta()).data.length;
    const meta = (await availability('get.plumbing').withMeta()).meta;
    // @ts-expect-error availability chooses its fields.
    await availability('get.plumbing', { fields: ['name'] });

    await check('get.plumbing', { apiKey: 'k', blocks: ['availability'] });
    // @ts-expect-error `gossip` is not a block.
    await check('get.plumbing', { apiKey: 'k', blocks: ['gossip'] });
    // @ts-expect-error the names are the first argument.
    await availabilityBatch(['a.io'], { names: ['b.io'] });

    for await (const row of priceHistory('io', { apiKey: 'k', registrar: 'porkbun', maxRows: 10 })) void row.registrar;
    for await (const trap of renewalTraps({ apiKey: 'k' })) void trap.tld;
    const first: number | null = (await pricesForTld('.io'))[0]?.purchasePrice ?? null;
    // @ts-expect-error the endings are the first argument.
    await cheapest(['ai'], { tlds: 'io' });

    const count: number = (await comparableSales('get.plumbing')).count;
    const value = (await appraisal('get.plumbing', { apiKey: 'k' })).current;
    const day = await drops({ day: '2026-11-25', ending: ['io', '.ai'] });
    const dropping: number | undefined = Array.isArray(day) ? day.length : day.count;
    for await (const row of expiring({ apiKey: 'k', ending: 'io', after: '2026-11-01' })) void row.expiresOn;
    // @ts-expect-error a day is a string, YYYY-MM-DD.
    await drops({ day: 20261125 });

    const twelveMonths = (await salesPulse()).pulse.windows.find((window) => window.id === '12m')?.count;
    const com: number | undefined = (await salesByEnding()).find((row) => row.ending === 'com')?.count12m;
    const word: 'result' | 'none' = (await salesOfWord('harbor')).status;
    // @ts-expect-error a series is by day, week or month.
    await salesSeries({ kind: 'year' });

    const closing: number | null | undefined = (await auctions()).closing;
    const auction = await auctionOf('get.plumbing');
    const bid = auction === null ? null : auction.bid;
    for await (const row of auctionOutcomes({ apiKey: 'k', venue: 'dynadot' })) void row.median;
    // @ts-expect-error `everywhere` is not a venue.
    await auctionOutcomes({ venue: 'everywhere' });

    return { read, moved, status, meta, first, count, value, dropping, twelveMonths, com, word, closing, bid };
};
