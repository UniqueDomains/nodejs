#!/usr/bin/env node
/*----------------------------------
- RECORD FIXTURES FROM THE LIVE API
----------------------------------*/

/**
 * Records the answers the tests replay: one free call per API (the document's tags), the three problem shapes a
 * keyless caller meets (400 `validation_failed`, 403 `keyed_only`, 404 `not_found`), one `.csv` form, and the calls the
 * README examples make that those do not cover. A `pages` entry follows `meta.cursor` to the end, one file a page.
 * About twenty keyless calls, so a whole run stays inside the keyless hourly window; `--only` records some. The 304,
 * the 429s, the 202 and a member key's quota headers cannot be recorded without a key or without spending the window:
 * they live in `SYNTHETIC` of `test/support/fixture-server.mjs`, written by hand from the document's examples.
 *
 * Usage: node scripts/record-fixtures.mjs                  (rewrites test/fixtures/recorded/)
 *        node scripts/record-fixtures.mjs --only a,b       (records the named entries, spends only their calls)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'fixtures', 'recorded');
const BASE = process.env.UD_API_BASE || 'https://api.unique.domains/v1';
const KEPT_HEADERS = /^(content-type|etag|retry-after|location|x-ratelimit-.*|x-quota-.*)$/i;

const CALLS = [
    { name: 'names-get-name', path: '/names/harbor.io' },
    { name: 'words-resolve-word', path: '/words/resolve', query: 'q=harbor' },
    { name: 'catalog-list-domains', path: '/domains', query: 'limit=2' },
    { name: 'tlds-list-tlds', path: '/tlds', query: 'limit=3' },
    { name: 'registrars-list-registrars', path: '/registrars' },
    { name: 'market-get-market-sales', path: '/market/sales' },
    { name: 'trends-list-trend-categories', path: '/trends/categories' },
    { name: 'agenda-list-events', path: '/events' },
    { name: 'shared-get-meta-freshness', path: '/meta/freshness' },
    { name: 'problem-validation-failed', path: '/names/harbor' },
    { name: 'problem-keyed-only', path: '/names/harbor.io/prices' },
    { name: 'problem-not-found', path: '/trends/zzz-no-such' },
    { name: 'csv-list-tlds', path: '/tlds.csv', query: 'limit=3' },
    { name: 'names-get-name-registry', path: '/names/harbor.io/registry' },
    { name: 'prices-list-tld-prices', path: '/prices/tlds/io' },
    { name: 'tlds-public-set', path: '/tlds', query: 'publicSet=true&limit=2&fields=tld,kind', pages: true },
];

const onlyAt = process.argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set((process.argv[onlyAt + 1] ?? '').split(',')) : null;
const unknown = only ? [...only].filter((name) => !CALLS.some((call) => call.name === name)) : [];
if (unknown.length > 0 || only?.size === 0) throw new Error(`--only names no entry: ${unknown.join(', ')}`);

const record = async (call, name, query) => {
    const url = `${BASE}${call.path}${query ? `?${query}` : ''}`;
    const response = await fetch(url, { headers: { 'user-agent': 'uniquedomains-nodejs-record' } });
    const text = await response.text();
    const headers = {};
    response.headers.forEach((value, name) => {
        if (KEPT_HEADERS.test(name)) headers[name] = value;
    });
    const isJson = (headers['content-type'] ?? '').includes('json');
    const fixture = {
        name,
        recordedOn: new Date().toISOString().slice(0, 10),
        request: { method: 'GET', path: call.path, query: query ?? '' },
        response: { status: response.status, headers, body: isJson ? JSON.parse(text) : text },
    };
    await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`${response.status} ${name}`);
    return fixture.response.body;
};

await mkdir(OUT, { recursive: true });
for (const call of CALLS.filter((entry) => !only || only.has(entry.name))) {
    let body = await record(call, call.pages ? `${call.name}-1` : call.name, call.query);
    for (let page = 2; call.pages && body.meta?.cursor; page++) body = await record(call, `${call.name}-${page}`, `${call.query}&cursor=${encodeURIComponent(body.meta.cursor)}`);
}
