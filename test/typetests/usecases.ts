/*----------------------------------
- TYPE TESTS: THE USE-CASE PACKAGES
----------------------------------*/

/** Checked by `npm run typecheck`, never run: the answers carry the API's types, and a wrong option fails to compile. */

import { appraisal, comparableSales } from '@uniquedomains/domain-appraisal';
import { availability, availabilityBatch, check } from '@uniquedomains/domain-availability';
import { cheapest, priceHistory, pricesForTld, renewalTraps } from '@uniquedomains/registrar-prices';
import { whois, whoisHistory } from '@uniquedomains/whois';

export const answers = async () => {
    const record = await whois('get.plumbing');
    const read: boolean = record.read;
    const moved: readonly unknown[] = (await whoisHistory('get.plumbing', { apiKey: 'k' })).moves ?? [];

    const stored = await availability('get.plumbing');
    const status: string = stored.status;
    // @ts-expect-error availability's answer holds the fields it asks for, and `length` is not one of them.
    void stored.length;
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
    return { read, moved, status, first, count, value };
};
