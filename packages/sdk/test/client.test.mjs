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

    it('retries once after Retry-After: 1 on rate_limited', async () => {
        const count = server.requests.length;
        const answer = await keyless().request('get_name', { path: { name: 'limited.io' } });
        assert.equal(answer.data.name, 'limited.io');
        assert.equal(server.requests.length - count, 2);
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
        await keyless().request('list_tlds', { query: { limit: 3 }, fields: ['tld', 'kind'] }).catch(() => undefined);
        assert.equal(new URLSearchParams(lastRequest().query).get('fields'), 'tld,kind');
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
