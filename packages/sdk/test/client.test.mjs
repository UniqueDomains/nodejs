import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ApiProblemError, createClient, ListingMismatchError } from '../dist/index.js';
import { loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';

let server;
before(async () => { server = await startFixtureServer(); });
after(async () => { await server.close(); });

const keyless = () => createClient({ apiKey: null, baseUrl: server.base });
const lastRequest = () => server.requests.at(-1);

describe('createClient: authentication', () => {
    it('calls the public base without a key', async () => {
        const client = keyless();
        assert.equal(client.auth, 'none');
        await client.request('get_name', { path: { name: 'harbor.io' } });
        assert.equal(lastRequest().headers.authorization, undefined);
        assert.match(lastRequest().headers['user-agent'], /^uniquedomains-sdk\//);
    });

    it('defaults to the public base', () => {
        assert.equal(createClient({ apiKey: null }).baseUrl, 'https://api.unique.domains/v1');
    });

    it('sends a member key as a bearer token', async () => {
        const client = createClient({ apiKey: 'ud_live_test', baseUrl: server.base });
        assert.equal(client.auth, 'member');
        await client.request('get_name', { path: { name: 'harbor.io' } });
        assert.equal(lastRequest().headers.authorization, 'Bearer ud_live_test');
    });

    it('reads UD_API_KEY when no key is passed, and ignores it on apiKey: null', async () => {
        const previous = process.env.UD_API_KEY;
        process.env.UD_API_KEY = 'ud_live_from_env';
        try {
            assert.equal(createClient({ baseUrl: server.base }).auth, 'member');
            assert.equal(createClient({ apiKey: null, baseUrl: server.base }).auth, 'none');
        } finally {
            if (previous === undefined) delete process.env.UD_API_KEY;
            else process.env.UD_API_KEY = previous;
        }
    });

    it('sends a RapidAPI key with its listing host, at that host by default', async () => {
        assert.equal(createClient({ rapidApi: { key: 'rk', listing: 'whois' } }).baseUrl, 'https://whois-lookup24.p.rapidapi.com');
        const client = createClient({ rapidApi: { key: 'rk', listing: 'whois' }, baseUrl: server.origin });
        assert.equal(client.auth, 'rapidapi');
        await client.request('get_name_registry', { path: { name: 'harbor.io' } }).catch(() => undefined);
        assert.equal(lastRequest().headers['x-rapidapi-key'], 'rk');
        assert.equal(lastRequest().headers['x-rapidapi-host'], 'whois-lookup24.p.rapidapi.com');
        assert.equal(lastRequest().path, '/names/harbor.io/registry');
    });

    it('refuses an operation outside the listing before any call', async () => {
        const client = createClient({ rapidApi: { key: 'rk', listing: 'whois' }, baseUrl: server.origin });
        const count = server.requests.length;
        await assert.rejects(client.request('get_name', { path: { name: 'harbor.io' } }), (error) => {
            assert.ok(error instanceof ListingMismatchError);
            assert.equal(error.operationId, 'get_name');
            assert.equal(error.listing, 'whois');
            assert.deepEqual([...error.servedBy].sort(), ['availability', 'names']);
            return true;
        });
        assert.equal(server.requests.length, count);
    });

    it('rejects a key and a RapidAPI subscription together, and an unknown listing', () => {
        assert.throws(() => createClient({ apiKey: 'k', rapidApi: { key: 'rk', listing: 'whois' } }), TypeError);
        assert.throws(() => createClient({ rapidApi: { key: 'rk', listing: 'nope' } }), TypeError);
    });
});

describe('request: one recorded answer per API', () => {
    const calls = {
        'names-get-name': ['get_name', { path: { name: 'harbor.io' } }],
        'words-resolve-word': ['resolve_word', { query: { q: 'harbor' } }],
        'catalog-list-domains': ['list_domains', { query: { limit: 2 } }],
        'tlds-list-tlds': ['list_tlds', { query: { limit: 3 } }],
        'registrars-list-registrars': ['list_registrars'],
        'market-get-market-sales': ['get_market_sales'],
        'trends-list-trend-categories': ['list_trend_categories'],
        'agenda-list-events': ['list_events'],
        'shared-get-meta-freshness': ['get_meta_freshness'],
    };
    for (const fixture of loadRecorded().filter((entry) => calls[entry.name])) {
        it(`${fixture.name} answers the envelope with its facts`, async () => {
            const [operationId, params] = calls[fixture.name];
            const answer = await keyless().request(operationId, params);
            assert.equal(answer.notModified, false);
            assert.equal(answer.status, 200);
            assert.deepEqual(answer.data, fixture.response.body.data);
            assert.deepEqual(answer.meta, fixture.response.body.meta);
            assert.deepEqual(answer.links, fixture.response.body.links);
            assert.equal(answer.etag, fixture.response.headers.etag ?? null);
            if (fixture.response.headers['x-ratelimit-limit']) assert.equal(answer.rateLimit.limit, Number(fixture.response.headers['x-ratelimit-limit']));
        });
    }
});

describe('request: problems', () => {
    it('400 validation_failed carries its extension members', async () => {
        await assert.rejects(keyless().request('get_name', { path: { name: 'harbor' } }), (error) => {
            assert.ok(error instanceof ApiProblemError);
            assert.equal(error.status, 400);
            assert.equal(error.code, 'validation_failed');
            assert.equal(error.problem.reason, 'not_a_name');
            assert.match(error.message, /bare word/);
            return true;
        });
    });

    it('403 keyed_only carries the product link', async () => {
        await assert.rejects(keyless().request('get_name_prices', { path: { name: 'harbor.io' } }), (error) => {
            assert.equal(error.code, 'keyed_only');
            assert.equal(error.product, 'https://unique.domains/pricing');
            return true;
        });
    });

    it('404 not_found', async () => {
        await assert.rejects(keyless().request('get_trend', { path: { slug: 'zzz-no-such' } }), (error) => error.code === 'not_found' && error.status === 404);
    });

    it('an answer without a problem body reads as unexpected_response', async () => {
        await assert.rejects(keyless().request('get_name', { path: { name: 'proxy.io' } }), (error) => {
            assert.ok(error instanceof ApiProblemError);
            assert.equal(error.code, 'unexpected_response');
            assert.equal(error.status, 502);
            return true;
        });
    });

    it('a gateway refusal keeps its message and its body', async () => {
        const client = createClient({ rapidApi: { key: 'rk', listing: 'whois' }, baseUrl: server.origin });
        await assert.rejects(client.request('get_name_registry', { path: { name: 'gateway.io' } }), (error) => {
            assert.equal(error.code, 'unexpected_response');
            assert.equal(error.detail, 'You are not subscribed to this API.');
            assert.deepEqual(error.problem.raw, { message: 'You are not subscribed to this API.' });
            return true;
        });
    });

    it('a success that is not the envelope reads as unexpected_response (review R1-5)', async () => {
        await assert.rejects(keyless().request('get_name', { path: { name: 'portal.io' } }), (error) => {
            assert.ok(error instanceof ApiProblemError);
            assert.equal(error.code, 'unexpected_response');
            assert.equal(error.status, 200);
            assert.match(error.problem.raw, /Sign in to the network/);
            return true;
        });
        await assert.rejects(keyless().request('get_name', { path: { name: 'array.io' } }), (error) => error.code === 'unexpected_response');
    });

    it('reads the status from the answer, not the body (review R1-17)', async () => {
        await assert.rejects(keyless().request('get_name', { path: { name: 'mismatch.io' } }), (error) => error.status === 403 && error.problem.status === 403);
    });

    it('a spent member month carries the quota and Retry-After', async () => {
        const client = createClient({ apiKey: 'ud_live_test', baseUrl: server.base });
        await assert.rejects(client.request('get_name_prices', { path: { name: 'quota.io' } }), (error) => {
            assert.equal(error.code, 'quota_spent');
            assert.equal(error.retryAfter, 86400);
            assert.equal(error.quota.remaining, 0);
            return true;
        });
    });
});

describe('request: 304, 429, 202', () => {
    it('answers notModified to an unchanged ETag', async () => {
        const client = keyless();
        const first = await client.request('get_name', { path: { name: 'harbor.io' } });
        assert.ok(first.etag);
        const second = await client.request('get_name', { path: { name: 'harbor.io' }, ifNoneMatch: first.etag });
        assert.equal(second.notModified, true);
        assert.equal(second.status, 304);
        assert.equal(lastRequest().headers['if-none-match'], first.etag);
    });

    it('retries once after Retry-After: 1 on rate_limited, after waiting the second', async () => {
        const count = server.requests.length;
        const answer = await keyless().request('get_name', { path: { name: 'limited.io' } });
        assert.equal(answer.data.name, 'limited.io');
        assert.equal(server.requests.length - count, 2);
        const [first, second] = server.requests.slice(-2);
        assert.ok(second.at - first.at >= 900, `waited ${second.at - first.at} ms`);
    });

    it('does not retry on Retry-After: 0 (review R1-15)', async () => {
        const count = server.requests.length;
        await assert.rejects(keyless().request('get_name', { path: { name: 'zero.io' } }), (error) => error.code === 'rate_limited' && error.retryAfter === 0);
        assert.equal(server.requests.length - count, 1);
    });

    it('stops the wait when the signal aborts', async () => {
        const controller = new AbortController();
        // twice.io always answers 429 with Retry-After: 1, so the client is inside its one-second wait at 50 ms.
        const pending = keyless().request('get_name', { path: { name: 'twice.io' }, signal: controller.signal });
        setTimeout(() => controller.abort(new Error('stopped')), 50);
        await assert.rejects(pending, /stopped/);
    });

    it('does not wait out a long Retry-After', async () => {
        const count = server.requests.length;
        await assert.rejects(keyless().request('get_name', { path: { name: 'slow.io' } }), (error) => error.code === 'rate_limited' && error.retryAfter === 900 && error.rateLimit.remaining === 0);
        assert.equal(server.requests.length - count, 1);
    });

    it('retries only once', async () => {
        const count = server.requests.length;
        await assert.rejects(keyless().request('get_name', { path: { name: 'twice.io' } }), (error) => error.code === 'rate_limited');
        assert.equal(server.requests.length - count, 2);
    });

    it('a 202 carries Location, Retry-After and the metered unit', async () => {
        const client = createClient({ apiKey: 'ud_live_test', baseUrl: server.base });
        const answer = await client.request('check_name', { path: { name: 'lantern.io' }, body: { blocks: ['availability'] } });
        assert.equal(answer.status, 202);
        assert.equal(answer.location, 'https://api.unique.domains/v1/names/lantern.io');
        assert.equal(answer.retryAfter, 30);
        assert.deepEqual(answer.quota.unit, { name: 'Live', limit: 50, remaining: 46 });
        assert.deepEqual(lastRequest().body, { blocks: ['availability'] });
        assert.equal(lastRequest().method, 'POST');
    });
});

describe('request: formats and projections', () => {
    it('format csv reads the .csv path as text', async () => {
        const answer = await keyless().request('list_tlds', { query: { limit: 3 }, format: 'csv' });
        assert.equal(lastRequest().path, '/v1/tlds.csv');
        assert.match(answer.text, /^tld,/);
        assert.match(answer.contentType, /text\/csv/);
    });

    it('format csv keeps path parameters', async () => {
        const answer = await keyless().request('list_tld_phases', { path: { tld: 'io' }, format: 'csv' });
        assert.equal(lastRequest().path, '/v1/tlds/io/phases.csv');
        assert.match(answer.text, /^phase,/);
    });

    it('refuses csv on an operation without that form, before any call', async () => {
        const count = server.requests.length;
        await assert.rejects(keyless().request('get_name', { path: { name: 'harbor.io' }, format: 'csv' }), TypeError);
        assert.equal(server.requests.length, count);
    });

    it('joins fields and include lists', async () => {
        await assert.rejects(keyless().request('list_tlds', { query: { limit: 3 }, fields: ['tld', 'kind'] }), (error) => error.code === 'not_found');
        assert.equal(new URLSearchParams(lastRequest().query).get('fields'), 'tld,kind');
        const endings = await keyless().request('get_word_endings', { path: { word: 'harbor' }, include: ['cheapest'] });
        assert.equal(endings.data.word, 'harbor');
        assert.equal(new URLSearchParams(lastRequest().query).get('include'), 'cheapest');
    });

    it('sends no empty fields (review R1-8)', async () => {
        await keyless().request('list_tlds', { query: { limit: 3 }, fields: [] });
        assert.equal(new URLSearchParams(lastRequest().query).has('fields'), false);
    });

    it('refuses fields or include an operation does not declare, before any call (review R1-8)', async () => {
        const count = server.requests.length;
        await assert.rejects(keyless().requestOperation('get_llms_txt', { fields: ['x'] }), /takes no fields/);
        await assert.rejects(keyless().requestOperation('list_tlds', { include: ['x'] }), /takes no include/);
        assert.equal(server.requests.length, count);
    });

    it('refuses dot path values, before any call (review R1-16)', async () => {
        const count = server.requests.length;
        for (const name of ['..', '.', '']) await assert.rejects(keyless().request('get_name', { path: { name } }), TypeError);
        assert.equal(server.requests.length, count);
    });

    it('sends If-None-Match only from ifNoneMatch (review R1-7)', async () => {
        const answer = await keyless().request('get_name', { path: { name: 'harbor.io' }, headers: { 'If-None-Match': 'W/"x"', 'X-Trace': 't' } });
        assert.equal(answer.notModified, false);
        assert.equal(lastRequest().headers['if-none-match'], undefined);
        assert.equal(lastRequest().headers['x-trace'], 't');
    });

    it('sends a body as JSON', async () => {
        const client = createClient({ apiKey: 'ud_live_test', baseUrl: server.base });
        await client.request('batch_names', { body: { names: ['a.io', 'b.io'] } });
        assert.deepEqual(lastRequest().body, { names: ['a.io', 'b.io'] });
        assert.match(lastRequest().headers['content-type'], /application\/json/);
    });

    it('parses a member key quota', async () => {
        const answer = await createClient({ apiKey: 'ud_live_test', baseUrl: server.base }).request('get_key');
        assert.equal(answer.quota.limit, 10000);
        assert.equal(answer.quota.remaining, 9588);
        assert.equal(answer.quota.resetsAt.toISOString(), '2026-12-01T00:00:00.000Z');
        assert.equal(answer.data.plan, 'founder');
    });
});

describe('the CommonJS build', () => {
    it('creates a client and calls (review finding 1)', async () => {
        const { createRequire } = await import('node:module');
        const sdk = createRequire(import.meta.url)('../dist/index.cjs');
        const answer = await sdk.createClient({ apiKey: null, baseUrl: server.base }).request('get_name', { path: { name: 'harbor.io' } });
        assert.equal(answer.data.name, 'harbor.io');
        assert.equal(typeof sdk.ApiProblemError, 'function');
    });
});

describe('requestOperation (review R1-2)', () => {
    it('calls an operation id known only at run time', async () => {
        const id = ['list', 'tlds'].join('_');
        const answer = await keyless().requestOperation(id, { query: { limit: 3 } });
        assert.equal(answer.notModified, false);
        assert.ok(!('text' in answer));
        assert.equal(answer.data.length, 3);
    });

    it('answers text for a file operation and refuses an unknown id', async () => {
        const csv = await keyless().requestOperation('list_tlds', { query: { limit: 3 }, format: 'csv' });
        assert.match(csv.text, /^tld,/);
        await assert.rejects(keyless().requestOperation('nope'), /Unknown operation/);
    });

    it('sends the operation method: GET, then POST with a JSON body', async () => {
        const client = createClient({ apiKey: 'ud_live_test', baseUrl: server.base });
        await client.requestOperation('get_name', { path: { name: 'harbor.io' } });
        assert.equal(lastRequest().method, 'GET');
        await client.requestOperation('batch_names', { body: { names: ['a.io'] } });
        assert.equal(lastRequest().method, 'POST');
    });
});

describe('the fixture server', () => {
    it('answers only under /v1 without a RapidAPI host (review R1-22)', async () => {
        const wrongBase = createClient({ apiKey: null, baseUrl: server.origin });
        await assert.rejects(wrongBase.request('get_name', { path: { name: 'harbor.io' } }), (error) => error.code === 'not_found');
    });
});
