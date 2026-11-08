/*----------------------------------
- TYPE TESTS: WHAT request() RETURNS
----------------------------------*/

/**
 * Compiled by `npm run typecheck`, never run. Each `@ts-expect-error` must stay an error and each assignment must
 * stay valid: the answer types follow the params a caller passes, including values only known at run time (review
 * finding 3 of 2026-11-08).
 */

import { createClient, type RequestParams } from '../src/index';

const ud = createClient();

export const checks = async (etag: string | null, format: 'json' | 'csv'): Promise<void> => {
    // No params: the plain envelope.
    const tlds = await ud.request('list_tlds');
    const count: number = tlds.data.length;

    // A literal path: the plain envelope.
    const name = await ud.request('get_name', { path: { name: 'harbor.io' } });
    const status: string = name.data.status;

    // An ETag that may be null: the 304 is in the union and must be narrowed.
    const again = await ud.request('get_name', { path: { name: 'harbor.io' }, ifNoneMatch: etag });
    // @ts-expect-error the answer may be a 304 without data
    void again.data;
    if (!again.notModified) void again.data.status;

    // A params object typed by its alias keeps the 304 too.
    const params: RequestParams<'list_tlds'> = { ifNoneMatch: etag };
    const page = await ud.request('list_tlds', params);
    // @ts-expect-error the answer may be a 304 without data
    void page.data;

    // A format known only at run time: envelope or text.
    const either = await ud.request('list_tlds', { format });
    // @ts-expect-error the answer may be text
    void either.data;
    if ('text' in either) void either.text.length;

    // A literal csv: text.
    const csv = await ud.request('list_tlds', { format: 'csv' });
    const text: string = csv.text;

    // Files answer text.
    const llms = await ud.request('get_llms_txt');
    const body: string = llms.text;

    // @ts-expect-error the path parameter is required
    await ud.request('get_name');
    // @ts-expect-error get_name has no CSV form
    await ud.request('get_name', { path: { name: 'harbor.io' }, format: 'csv' });
    // @ts-expect-error unknown operation
    await ud.request('nope');

    void [count, status, text, body];
};
