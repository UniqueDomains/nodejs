/*----------------------------------
- TYPE TESTS: THE NAMESPACED METHODS
----------------------------------*/

/**
 * Compiled by `npm run typecheck`, never run. The method signatures (plan decisions 13 and 14): positional path
 * values, a typed options object, `data` on await, the whole answer from `withMeta()`, rows from a paged call.
 */

import { ApiProblemError, createClient, PlanRequiredError, RateLimitError, type ApiTextResult, type DataOf } from '../src/index';

const ud = createClient({ retry: { attempts: 3, maxDelayMs: 10_000 } });

export const checks = async (): Promise<void> => {
    // await gives data, typed from the document.
    const name = await ud.names.get('harbor.io');
    const status: string = name.status;
    const same: DataOf<'get_name'> = name;

    // withMeta gives the 0.1.0 answer.
    const answer = await ud.names.get('harbor.io', { fields: ['status'] }).withMeta();
    const etag: string | null = answer.etag;
    const cursor: string | null | undefined = answer.meta.cursor;
    void answer.data.status;

    // Two positional path values in path order.
    await ud.editions.get('founder', '2026-11-02');
    // A required query value makes the options object required.
    await ud.words.resolve({ q: 'harbor' });
    // @ts-expect-error resolve needs its q
    await ud.words.resolve();
    // Body properties sit beside query keys in the options object.
    await ud.names.batch({ names: ['harbor.io'], fields: 'name' });
    // @ts-expect-error batch needs its names
    await ud.names.batch({});
    // A body with no required property leaves the options out.
    await ud.names.check('lantern.io');

    // @ts-expect-error the path value is required
    await ud.names.get();
    // @ts-expect-error a wrong option is a compile error
    await ud.domains.expiring({ tld: 'io' });
    // @ts-expect-error ifNoneMatch belongs to request
    await ud.names.get('harbor.io', { ifNoneMatch: 'W/"x"' });
    // @ts-expect-error get_name declares no include
    await ud.names.get('harbor.io', { include: ['x'] });
    // @ts-expect-error maxRows only on a paged operation
    await ud.names.get('harbor.io', { maxRows: 3 });
    // @ts-expect-error no such method
    await ud.names.nope('harbor.io');

    // A paged call iterates rows and pages; `await` still gives the first page's data.
    for await (const row of ud.domains.expiring({ ending: 'io', maxRows: 100 })) void row.name;
    for await (const page of ud.tlds.list({ publicSet: true }).pages()) void page.meta.cursor;
    const firstPage = await ud.tlds.list({ limit: 3 });
    const count: number = firstPage.length;
    // @ts-expect-error a call that is not paged does not iterate
    for await (const row of ud.names.get('harbor.io')) void row;

    // A file operation gives its text.
    const text: string = await ud.meta.llmsTxt();
    const calendar: string = await ud.agenda.ics({ tld: 'io' });
    const events: string = await ud.agenda.eventsIcs();
    const file: ApiTextResult = await ud.meta.openapi({ listing: 'whois' }).withMeta();

    // The typed errors are ApiProblemError.
    try {
        await ud.names.prices('harbor.io');
    } catch (error) {
        if (error instanceof RateLimitError) void (error.retryAfter satisfies number | null);
        if (error instanceof PlanRequiredError) void (error.product satisfies string | null);
        if (error instanceof ApiProblemError) void error.code;
    }

    void [status, same, etag, cursor, count, text, calendar, events, file];
};
