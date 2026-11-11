/*----------------------------------
- FIXTURE SERVER
----------------------------------*/

/**
 * A local HTTP server replaying the recorded answers (`test/fixtures/recorded/`, from `scripts/record-fixtures.mjs`)
 * and the synthetic ones below (what cannot be recorded keyless: a 304, the 429s, a 202, a member key's quota). It
 * logs every request it receives, so a test can assert what the client sent, and answers 404 `not_found` to anything
 * it has no fixture for. Paths are matched with or without the `/v1` prefix, so the same fixtures serve a client on
 * the public base and one on a RapidAPI host.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'recorded');

/*----------------------------------
- FIXTURES
----------------------------------*/

export const loadRecorded = () => readdirSync(RECORDED_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(RECORDED_DIR, file), 'utf8')));

const problem = (code, status, detail, extra = {}) => ({ type: `https://unique.domains/api/problems/${code}`, title: code, status, detail, instance: '/v1/test', code, ...extra });

const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json; charset=utf-8', ...headers }, body });

const envelope = (data, self, cursor = null) => ({ data, meta: { asOf: null, cursor, limit: cursor === null ? null : 2 }, links: { self: `https://api.unique.domains/v1${self}`, next: null, register: null, product: null, dataset: null } });

const expiringRow = (name) => ({ id: `dom_${name}`, name, ending: 'io', expiresOn: '2026-11-20', status: 'expiring' });

/** A recorded response, its `links.self` set to the call that serves it. */
const recordedAt = (name, self) => {
    const { response } = loadRecorded().find((fixture) => fixture.name === name);
    return self ? { ...response, body: { ...response.body, links: { ...response.body.links, self } } } : response;
};

const getNameBody = (name) => {
    const recorded = loadRecorded().find((fixture) => fixture.name === 'names-get-name').response.body;
    return { ...recorded, data: { ...recorded.data, name } };
};

// `X-Quota-Reset` is the first instant of the next UTC month in unix seconds: 2026-12-01T00:00:00Z.
const QUOTA_RESET = String(Date.UTC(2026, 11, 1) / 1000);

/** Any test's member key, the README run's included: the keyed fixtures below answer it, and refuse a call without one. */
export const USECASE_KEY = /^Bearer ud_live_/;
export const FOUNDER_KEY = 'ud_live_founder';

const keyedOnly = (method, path) => problem('keyed_only', 403, `${method} ${path} needs a Pro, Ultra or Mega subscription, or a member key.`, { product: 'https://unique.domains/pricing' });

/**
 * A keyed call: the answer with a member key, and the free grade's refusal without one. The bodies are the document's
 * examples, on a made-up name, so nobody reads them as facts about a real one.
 */
const keyed = (name, method, path, query, data, plan = null) => [
    // An Investor endpoint: a Founder key is refused by plan. First, since the pattern below also fits that key.
    ...(plan === 'investor' ? [{ name: `${name}-founder`, request: { method, path, query, header: ['authorization', `Bearer ${FOUNDER_KEY}`] }, response: json(403, problem('plan_required', 403, `${method} ${path} needs the Investor plan.`, { product: 'https://app.unique.domains/settings/account' })) }] : []),
    { name, request: { method, path, query, header: ['authorization', USECASE_KEY] }, response: json(200, envelope(data, path), { 'x-quota-limit': '10000', 'x-quota-remaining': '9000', 'x-quota-reset': QUOTA_RESET }) },
    { name: `${name}-refused`, request: { method, path, query }, response: json(403, keyedOnly(method, path)) },
];

const VALUE = { current: { value: 4200, asOf: '2026-10-30T11:02:00.000Z' }, history: [{ value: 4200, date: '2026-10-30T11:02:00.000Z' }] };
const KEYED_NAME = { ...getNameBody('zorbly.io').data, rating: { band: 'strong', score: 68 }, value: { value: 4200, upsidePercent: null, liquidity: 'medium' } };

export const SYNTHETIC = [
    ...keyed('usecase-registry-history', 'GET', '/names/zorbly.io/registry/history', '', { versions: [{ observedAt: '2025-06-02T04:10:00.000Z', registrar: 'GoDaddy.com, LLC', registered: true }], moves: [{ at: '2026-02-11T08:02:00.000Z', from: 'GoDaddy.com, LLC', to: 'Gandi SAS' }], transfers: [], lockChanges: [] }, 'investor'),
    ...keyed('usecase-check', 'POST', '/names/zorbly.io/check', '', { ...KEYED_NAME, checked: true }),
    ...keyed('usecase-cheapest', 'GET', '/prices/cheapest', 'tlds=ai,io', [{ ending: 'ai', cheapestYear1: { registrar: 'porkbun', price: 71.4 }, cheapestRenewal: { registrar: 'porkbun', price: 71.4 }, cheapestTransfer: { registrar: 'cloudflare', price: 80 }, trap: false }, { ending: 'io', cheapestYear1: { registrar: 'porkbun', price: 28.12 }, cheapestRenewal: { registrar: 'cloudflare', price: 38.5 }, cheapestTransfer: { registrar: 'cloudflare', price: 38.5 }, trap: false }]),
    ...keyed('usecase-price-history', 'GET', '/prices/tlds/io/history', '', [{ registrar: 'namecheap', currency: 'USD', purchasePrice: 34.98, regularPurchasePrice: null, renewalPrice: 59.98, transferPrice: 54.98, isPromo: false, firstSeenAt: '2026-11-03T05:40:00.000Z', lastSeenAt: '2026-11-05T05:41:00.000Z', observations: 3 }], 'investor'),
    ...keyed('usecase-value', 'GET', '/names/zorbly.io/value', '', VALUE),
    ...keyed('usecase-value-untracked', 'GET', '/names/harbor.io/value', '', { current: null, history: [] }),
    ...keyed('usecase-appraise', 'POST', '/names/zorbly.io/appraise', '', VALUE, 'investor'),
    {
        name: 'usecase-appraise-running',
        request: { method: 'POST', path: '/names/running.io/appraise', query: '', header: ['authorization', USECASE_KEY] },
        response: json(202, envelope({ current: null, history: [] }, '/names/running.io/appraise'), { location: 'https://api.unique.domains/v1/names/running.io/value', 'retry-after': '30' }),
    },
    { name: 'usecase-batch-founder', request: { method: 'POST', path: '/names/batch', query: '', header: ['authorization', `Bearer ${FOUNDER_KEY}`] }, response: json(403, problem('plan_required', 403, 'POST /names/batch needs the Investor plan.')) },
    {
        name: 'usecase-batch',
        request: { method: 'POST', path: '/names/batch', query: '', header: ['authorization', USECASE_KEY] },
        response: json(200, envelope([KEYED_NAME, { name: 'zorbly.ai', tracked: false }, { name: 'foo@bar.com', error: 'validation_failed' }], '/names/batch')),
    },
    {
        name: 'member-get-key',
        request: { method: 'GET', path: '/meta/key', query: '' },
        response: json(200, {
            data: { access: 'member', plan: 'founder', keyPrefix: 'ud_live_A1b2', listing: null, subscription: null, month: '2026-11', resetsOn: '2026-12-01', calls: { used: 412, allowance: 10000 }, liveChecks: { used: 3, allowance: 50 }, appraisals: { used: 0, allowance: 0 }, intakes: { used: 0, allowance: 0 }, investorEndpoints: false },
            meta: { asOf: null, cursor: null, limit: null },
            links: { self: 'https://api.unique.domains/v1/meta/key', next: null, register: null, product: null, dataset: null },
        }, { 'x-quota-limit': '10000', 'x-quota-remaining': '9588', 'x-quota-reset': QUOTA_RESET }),
    },
    {
        name: 'rate-limited-then-ok',
        request: { method: 'GET', path: '/names/limited.io', query: '' },
        responses: [
            json(429, problem('rate_limited', 429, 'Too many calls this second.'), { 'retry-after': '1' }),
            json(200, getNameBody('limited.io'), { etag: 'W/"limited"' }),
        ],
    },
    {
        name: 'rate-limited-long',
        request: { method: 'GET', path: '/names/slow.io', query: '' },
        response: json(429, problem('rate_limited', 429, 'The keyless hourly window is spent.'), { 'retry-after': '900', 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '900' }),
    },
    {
        name: 'rate-limited-twice',
        request: { method: 'GET', path: '/names/twice.io', query: '' },
        response: json(429, problem('rate_limited', 429, 'Too many calls this second.'), { 'retry-after': '1' }),
    },
    {
        name: 'quota-spent',
        request: { method: 'GET', path: '/names/quota.io/prices', query: '' },
        response: json(429, problem('quota_spent', 429, 'This key\'s calls for 2026-11 are spent.', { product: 'https://app.unique.domains/settings/account' }), { 'retry-after': '86400', 'x-quota-limit': '10000', 'x-quota-remaining': '0', 'x-quota-reset': QUOTA_RESET }),
    },
    {
        name: 'check-accepted',
        request: { method: 'POST', path: '/names/lantern.io/check', query: '' },
        response: json(202, getNameBody('lantern.io'), { location: 'https://api.unique.domains/v1/names/lantern.io', 'retry-after': '30', 'x-quota-limit': '10000', 'x-quota-remaining': '9587', 'x-quota-reset': QUOTA_RESET, 'x-quota-unit': 'Live', 'x-quota-unit-limit': '50', 'x-quota-unit-remaining': '46' }),
    },
    {
        name: 'batch-names',
        request: { method: 'POST', path: '/names/batch', query: '' },
        response: json(200, { data: [], meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://api.unique.domains/v1/names/batch', next: null, register: null, product: null, dataset: null } }),
    },
    {
        name: 'proxy-error',
        request: { method: 'GET', path: '/names/proxy.io', query: '' },
        response: { status: 502, headers: { 'content-type': 'text/html' }, body: '<html><body>Bad gateway</body></html>' },
    },
    {
        name: 'retry-after-zero',
        request: { method: 'GET', path: '/names/zero.io', query: '' },
        response: json(429, problem('rate_limited', 429, 'Too many calls this second.'), { 'retry-after': '0' }),
    },
    {
        name: 'html-success',
        request: { method: 'GET', path: '/names/portal.io', query: '' },
        response: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><body>Sign in to the network</body></html>' },
    },
    {
        name: 'array-success',
        request: { method: 'GET', path: '/names/array.io', query: '' },
        response: json(200, []),
    },
    {
        name: 'status-mismatch',
        request: { method: 'GET', path: '/names/mismatch.io', query: '' },
        response: json(403, problem('keyed_only', 400, 'A gateway rewrote the status.')),
    },
    {
        name: 'word-endings-include',
        request: { method: 'GET', path: '/words/harbor/endings', query: 'include=cheapest' },
        response: json(200, { data: { word: 'harbor', endings: [] }, meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://api.unique.domains/v1/words/harbor/endings', next: null, register: null, product: null, dataset: null } }),
    },
    {
        name: 'meta-enums',
        request: { method: 'GET', path: '/meta/enums', query: '' },
        response: json(200, { data: { status: ['free', 'registered'], nested: { kinds: [{ id: 'registry', label: 'Registry' }] } }, meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://api.unique.domains/v1/meta/enums', next: null, register: null, product: null, dataset: null } }),
    },
    {
        name: 'member-get-key-projected',
        request: { method: 'GET', path: '/meta/key', query: 'fields=plan' },
        response: json(200, { data: { plan: 'founder' }, meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://api.unique.domains/v1/meta/key?fields=plan', next: null, register: null, product: null, dataset: null } }),
    },
    {
        name: 'null-data',
        request: { method: 'GET', path: '/names/empty.io', query: '' },
        response: json(200, { data: null, meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://api.unique.domains/v1/names/empty.io', next: null, register: null, product: null, dataset: null } }),
    },
    {
        name: 'rapidapi-get-key',
        request: { method: 'GET', path: '/meta/key', query: '', header: ['x-rapidapi-host', 'whois-lookup24.p.rapidapi.com'] },
        response: json(200, {
            data: { access: 'rapidapi', plan: null, keyPrefix: null, listing: 'whois', subscription: 'BASIC', month: null, resetsOn: null, calls: null, liveChecks: null, appraisals: null, intakes: null, investorEndpoints: null },
            meta: { asOf: null, cursor: null, limit: null },
            links: { self: 'https://whois-lookup24.p.rapidapi.com/meta/key', next: null, register: null, product: null, dataset: null },
        }),
    },
    {
        name: 'rapidapi-registry',
        request: { method: 'GET', path: '/names/harbor.io/registry', query: '', header: ['x-rapidapi-host', 'whois-lookup24.p.rapidapi.com'] },
        response: json(200, { data: { name: 'harbor.io', registrar: null }, meta: { asOf: null, cursor: null, limit: null }, links: { self: 'https://whois-lookup24.p.rapidapi.com/names/harbor.io/registry', next: null, register: null, product: null, dataset: null } }, { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '999' }),
    },
    // The README's sample name: its recorded answers served for the README's calls. Its availability fields stand for
    // the whole name (what the examples print), and the keyed-only refusal depends on the endpoint, not the name.
    { name: 'readme-get-name', request: { method: 'GET', path: '/names/get.plumbing', query: '' }, response: recordedAt('usecase-availability', 'https://api.unique.domains/v1/names/get.plumbing') },
    { name: 'readme-keyed-only', request: { method: 'GET', path: '/names/get.plumbing/prices', query: '' }, response: { ...recordedAt('problem-keyed-only'), body: { ...recordedAt('problem-keyed-only').body, instance: '/v1/names/get.plumbing/prices' } } },
    {
        // The SDK README's RapidAPI example: the recorded registry record of its sample name, as the whois host serves it.
        name: 'rapidapi-registry-readme',
        request: { method: 'GET', path: '/names/get.plumbing/registry', query: '', header: ['x-rapidapi-host', 'whois-lookup24.p.rapidapi.com'] },
        response: json(200, recordedAt('usecase-registry', 'https://whois-lookup24.p.rapidapi.com/names/get.plumbing/registry').body, { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '999' }),
    },
    {
        name: 'gateway-refusal',
        request: { method: 'GET', path: '/names/gateway.io/registry', query: '', header: ['x-rapidapi-host', 'whois-lookup24.p.rapidapi.com'] },
        response: { status: 403, headers: { 'content-type': 'application/json' }, body: { message: 'You are not subscribed to this API.' } },
    },
    {
        name: 'csv-with-path-param',
        request: { method: 'GET', path: '/tlds/io/phases.csv', query: '' },
        response: { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' }, body: 'phase,startsOn,endsOn\ngeneral,1997-09-16,\n' },
    },
    {
        name: 'expiring-io-1',
        request: { method: 'GET', path: '/domains/expiring', query: 'ending=io' },
        response: json(200, envelope([expiringRow('anchor.io'), expiringRow('beacon.io')], '/domains/expiring?ending=io', 'c2')),
    },
    {
        name: 'expiring-io-2',
        request: { method: 'GET', path: '/domains/expiring', query: 'ending=io&cursor=c2' },
        response: json(200, envelope([expiringRow('cove.io'), expiringRow('dune.io')], '/domains/expiring?ending=io&cursor=c2', 'c3')),
    },
    {
        name: 'expiring-io-3',
        request: { method: 'GET', path: '/domains/expiring', query: 'ending=io&cursor=c3' },
        response: json(200, envelope([expiringRow('ember.io')], '/domains/expiring?ending=io&cursor=c3')),
    },
    {
        name: 'drops-summary',
        request: { method: 'GET', path: '/domains/drops', query: '' },
        response: json(200, envelope({ count: 184, byEnding: [{ ending: 'online', count: 151 }], sample: [{ ending: 'online', dropsOn: '2026-11-07' }] }, '/domains/drops')),
    },
    {
        name: 'not-ready-then-ok',
        request: { method: 'GET', path: '/names/ready.io', query: '' },
        responses: [
            json(503, problem('not_ready', 503, 'The answer is being prepared.')),
            json(200, getNameBody('ready.io')),
        ],
    },
    {
        name: 'not-ready-then-ok-for-retry',
        request: { method: 'GET', path: '/names/retry.io', query: '' },
        responses: [
            json(503, problem('not_ready', 503, 'The answer is being prepared.')),
            json(200, getNameBody('retry.io')),
        ],
    },
    {
        name: 'llms-txt',
        request: { method: 'GET', path: '/meta/llms.txt', query: '' },
        response: { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: '# Unique Domains API\n' },
    },
    {
        name: 'register-and-dataset-links',
        request: { method: 'GET', path: '/names/open.io', query: '' },
        response: json(200, { ...getNameBody('open.io'), links: { self: 'https://api.unique.domains/v1/names/open.io', next: null, register: 'https://app.unique.domains/domain/dom_1/go/porkbun', product: null, dataset: 'https://github.com/UniqueDomains/io-domains' } }),
    },
];

/*----------------------------------
- SERVER
----------------------------------*/

/**
 * The public base serves under `/v1`; a RapidAPI host serves at its root. A request matches a fixture only under the
 * prefix its headers call for (review R1-22: a client on a wrong base path no longer passes).
 */
const routedPath = (path, headers) => {
    if (headers['x-rapidapi-host']) return path;
    return path.startsWith('/v1/') ? path.slice(3) : null;
};

const keyOf = (method, path, query) => `${method} ${path}?${[...new URLSearchParams(query)].map(([key, value]) => `${key}=${value}`).sort().join('&')}`;

/** A fixture with `request.header: [name, value or pattern]` answers only a request carrying that header, and wins over one without. */
const matches = (fixture, headers) => {
    if (!fixture.request.header) return true;
    const [name, expected] = fixture.request.header;
    return expected instanceof RegExp ? expected.test(headers[name] ?? '') : headers[name] === expected;
};

export const startFixtureServer = async (extra = []) => {
    const fixtures = new Map();
    for (const fixture of [...extra, ...loadRecorded(), ...SYNTHETIC]) {
        const key = keyOf(fixture.request.method, fixture.request.path, fixture.request.query);
        const list = fixtures.get(key) ?? [];
        list.push({ fixture, served: 0 });
        list.sort((left, right) => Number(Boolean(right.fixture.request.header)) - Number(Boolean(left.fixture.request.header)));
        fixtures.set(key, list);
    }
    const requests = [];

    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            requests.push({ method: req.method, path: url.pathname, query: url.search.slice(1), headers: req.headers, body: raw ? JSON.parse(raw) : undefined, at: Date.now() });
            const path = routedPath(url.pathname, req.headers);
            const entry = path === null ? undefined : (fixtures.get(keyOf(req.method, path, url.search.slice(1))) ?? []).find((candidate) => matches(candidate.fixture, req.headers));
            if (!entry) {
                res.writeHead(404, { 'content-type': 'application/problem+json' });
                res.end(JSON.stringify(problem('not_found', 404, `No fixture for ${req.method} ${url.pathname}${url.search}.`)));
                return;
            }
            const sequence = entry.fixture.responses ?? [entry.fixture.response];
            const response = sequence[Math.min(entry.served, sequence.length - 1)];
            entry.served++;
            const etag = response.headers.etag;
            if (etag && req.headers['if-none-match'] === etag) {
                res.writeHead(304, { etag });
                res.end();
                return;
            }
            res.writeHead(response.status, response.headers);
            res.end(typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    return {
        origin,
        base: `${origin}/v1`,
        requests,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
};
