import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cheapest, MAX_CHEAPEST_TLDS, PlanRequiredError, priceChanges, priceHistory, pricesForTld, renewalTraps } from '../dist/index.js';
import { FOUNDER_KEY, loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const KEY = 'ud_live_usecase';
const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const keyed = () => ({ apiKey: KEY, baseUrl: server.base });
const last = () => server.requests.at(-1);

describe('@uniquedomains/registrar-prices', () => {
    it('reads every registrar\'s price for free, sending no key', async () => {
        assert.deepEqual(await pricesForTld('io', free()), recorded('prices-list-tld-prices').data);
        assert.equal(last().path, '/v1/prices/tlds/io');
        assert.equal(last().headers.authorization, undefined);
    });

    it('reads .IO and io as one ending', async () => {
        await pricesForTld('.IO', free());
        assert.equal(last().path, '/v1/prices/tlds/io');
    });

    it('reads the renewal traps, with the whole count in the meta', async () => {
        assert.deepEqual(await renewalTraps(free()), recorded('usecase-price-traps').data);
        const { meta } = await renewalTraps(free()).withMeta();
        assert.equal(meta.trapCount, recorded('usecase-price-traps').meta.trapCount);
    });

    it('reads the price changes, and loops over them', async () => {
        assert.deepEqual(await priceChanges(free()), recorded('usecase-price-changes').data);
        const rows = [];
        for await (const row of priceChanges({ ...free(), maxRows: 2 })) rows.push(row);
        assert.equal(rows.length, 2);
    });

    it('sends the endings of cheapest joined, with the key', async () => {
        const rows = await cheapest(['AI', '.io'], keyed());
        assert.equal(new URLSearchParams(last().query).get('tlds'), 'ai,io');
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.deepEqual(rows.map((row) => row.ending), ['ai', 'io']);
    });

    it('throws PlanRequiredError on the price history with a Founder key', async () => {
        await assert.rejects(priceHistory('io', { apiKey: FOUNDER_KEY, baseUrl: server.base }), PlanRequiredError);
    });

    it('refuses a string, an empty list and one over the limit before any call', () => {
        const before = server.requests.length;
        assert.throws(() => cheapest('ai,io', keyed()), TypeError);
        assert.throws(() => cheapest([], keyed()), RangeError);
        assert.throws(() => cheapest(Array.from({ length: MAX_CHEAPEST_TLDS + 1 }, () => 'io'), keyed()), /1 to 100 endings, not 101/);
        assert.equal(server.requests.length, before);
    });

    it('sends the key on the price history, and loops over its rows', async () => {
        const rows = [];
        for await (const row of priceHistory('io', keyed())) rows.push(row);
        assert.equal(last().path, '/v1/prices/tlds/io/history');
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.equal(rows[0].registrar, 'namecheap');
    });

    it('throws PlanRequiredError on the keyed calls without a key', async () => {
        await assert.rejects(cheapest(['ai', 'io'], free()), PlanRequiredError);
        await assert.rejects(priceHistory('io', free()), PlanRequiredError);
    });
});

describe('ud-prices', () => {
    const base = () => ['--base', server.base];

    it('prints an ending\'s prices, as JSON in a pipe and as a table with --no-json', async () => {
        const json = await runBin('registrar-prices', ['io', ...base()]);
        assert.equal(json.code, 0);
        assert.deepEqual(JSON.parse(json.stdout), recorded('prices-list-tld-prices').data);
        const table = await runBin('registrar-prices', ['io', '--no-json', ...base()]);
        assert.match(table.stdout, /^registrar\s+name\s+/);
        assert.match(table.stdout, /^porkbun\s+Porkbun/m);
    });

    it('runs each mode', async () => {
        assert.equal((await runBin('registrar-prices', ['--traps', ...base()])).code, 0);
        assert.equal(last().path, '/v1/prices/traps');
        assert.equal((await runBin('registrar-prices', ['--changes', ...base()])).code, 0);
        assert.equal(last().path, '/v1/prices/changes');
        assert.equal((await runBin('registrar-prices', ['--cheapest', 'ai,io', '--key', KEY, ...base()])).code, 0);
        assert.equal(last().path, '/v1/prices/cheapest');
        assert.equal((await runBin('registrar-prices', ['io', '--history', '--key', KEY, ...base()])).code, 0);
        assert.equal(last().path, '/v1/prices/tlds/io/history');
    });

    it('points at the CLI for a next page', async () => {
        const extra = await startFixtureServer([{
            name: 'traps-paged',
            request: { method: 'GET', path: '/prices/traps', query: '' },
            response: { status: 200, headers: { 'content-type': 'application/json' }, body: { data: [{ tld: 'xyz' }], meta: { asOf: null, cursor: 'c2', limit: 1 }, links: {} } },
        }]);
        try {
            const { stderr } = await runBin('registrar-prices', ['--traps', '--base', extra.base]);
            assert.match(stderr, /More rows: npx @uniquedomains\/cli list-price-traps --cursor c2/);
        } finally {
            await extra.close();
        }
    });

    it('exits 1 on a keyed mode without a key, and 2 on arguments that cannot call', async () => {
        assert.equal((await runBin('registrar-prices', ['--cheapest', 'ai,io', ...base()])).code, 1);
        const before = server.requests.length;
        for (const args of [['--traps', '--changes'], ['--traps', 'io'], ['--changes', 'io'], ['--cheapest', ' , ', '--key', KEY], ['a', 'b'], ['...'], ['--history'], ['--cheapest', 'ai', 'io', '--key', KEY]]) {
            assert.equal((await runBin('registrar-prices', [...args, ...base()])).code, 2, args.join(' '));
        }
        assert.equal(server.requests.length, before);
    });
});
