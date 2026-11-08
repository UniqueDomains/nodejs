#!/usr/bin/env node
/*----------------------------------
- RECORD FIXTURES FROM THE LIVE API
----------------------------------*/

/**
 * Records the answers the tests replay: one free call per API (the document's tags), the three problem shapes a
 * keyless caller meets (400 `validation_failed`, 403 `keyed_only`, 404 `not_found`) and one `.csv` form. Thirteen
 * keyless calls, so a run stays well inside the keyless hourly window. The 304, the 429s, the 202 and a member key's
 * quota headers cannot be recorded without a key or without spending the window: they live in `SYNTHETIC` of
 * `test/support/fixture-server.mjs`, written by hand from the document's examples.
 *
 * Usage: node scripts/record-fixtures.mjs   (rewrites test/fixtures/recorded/)
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
];

await mkdir(OUT, { recursive: true });
for (const call of CALLS) {
    const url = `${BASE}${call.path}${call.query ? `?${call.query}` : ''}`;
    const response = await fetch(url, { headers: { 'user-agent': 'uniquedomains-nodejs-record' } });
    const text = await response.text();
    const headers = {};
    response.headers.forEach((value, name) => {
        if (KEPT_HEADERS.test(name)) headers[name] = value;
    });
    const isJson = (headers['content-type'] ?? '').includes('json');
    const fixture = {
        name: call.name,
        recordedOn: new Date().toISOString().slice(0, 10),
        request: { method: 'GET', path: call.path, query: call.query ?? '' },
        response: { status: response.status, headers, body: isJson ? JSON.parse(text) : text },
    };
    await writeFile(join(OUT, `${call.name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`${response.status} ${call.name}`);
}
