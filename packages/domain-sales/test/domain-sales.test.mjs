import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { RateLimitError, salesByEnding, salesByLength, salesMovers, salesOfWord, salesPulse, salesSeries } from '../dist/index.js';
import { loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const last = () => server.requests.at(-1);
const bin = (args, env = {}) => runBin('domain-sales', args, { UD_API_BASE: server.base, ...env });

describe('domain-sales', () => {
    it('reads the market for free, sending no key', async () => {
        assert.deepEqual(await salesPulse(free()), recorded('market-get-market-sales').data);
        assert.equal(last().path, '/v1/market/sales');
        assert.equal(last().headers.authorization, undefined);
    });

    it('reads the endings, the lengths, the movers and a series for free', async () => {
        assert.deepEqual(await salesByEnding(free()), recorded('usecase-sales-endings').data);
        assert.equal(last().path, '/v1/market/sales/endings');
        assert.deepEqual(await salesByLength(free()), recorded('usecase-sales-lengths').data);
        assert.equal(last().path, '/v1/market/sales/lengths');
        assert.deepEqual(await salesMovers(free()), recorded('usecase-sales-movers').data);
        assert.equal(last().path, '/v1/market/sales/movers');
        assert.deepEqual(await salesSeries({ ...free(), kind: 'month' }), recorded('usecase-sales-series').data);
        assert.equal(last().query, 'kind=month');
    });

    it('reads one word for free', async () => {
        assert.deepEqual(await salesOfWord('harbor', free()), recorded('usecase-sales-word').data);
        assert.equal(last().path, '/v1/market/sales/words/harbor');
    });

    it('passes the API\'s refusal of a second word in one day on as it is: a RateLimitError (side path)', async () => {
        await assert.rejects(salesOfWord('lantern', free()), (error) => {
            assert.ok(error instanceof RateLimitError);
            assert.match(error.detail, /one word a day/);
            return true;
        });
    });

    it('never lists a single sale: the answers are counts and medians', () => {
        for (const name of ['market-get-market-sales', 'usecase-sales-endings', 'usecase-sales-lengths', 'usecase-sales-movers', 'usecase-sales-series', 'usecase-sales-word']) {
            assert.doesNotMatch(JSON.stringify(recorded(name).data), /"(?:price|priceUsd|soldOn|domain)"\s*:/, name);
        }
    });
});

describe('ud-sales', () => {
    it('prints the market with no argument', async () => {
        const { code, stdout } = await bin([]);
        assert.equal(code, 0);
        assert.deepEqual(JSON.parse(stdout), recorded('market-get-market-sales').data);
    });

    it('prints one ending\'s row for an argument with a dot, .COM and .com alike', async () => {
        const com = recorded('usecase-sales-endings').data.find((row) => row.ending === 'com');
        assert.deepEqual(JSON.parse((await bin(['.com'])).stdout), com);
        assert.deepEqual(JSON.parse((await bin(['.COM'])).stdout), com);
    });

    it('says when an ending has no figures, on a terminal', async () => {
        const { code, stdout } = await bin(['.zzz', '--no-json']);
        assert.equal(code, 0);
        assert.match(stdout, /No sales figures for \.zzz: an ending shows here from three sales in 12 months\./);
    });

    it('prints a word', async () => {
        assert.deepEqual(JSON.parse((await bin(['harbor'])).stdout), recorded('usecase-sales-word').data);
    });

    it('prints one line on a second word with no key: a word a day (side path)', async () => {
        const { code, stdout, stderr } = await bin(['lantern']);
        assert.equal(code, 1);
        assert.equal(stdout, '');
        assert.match(stderr, /one word a day/);
        assert.match(stderr, /^With no key, one address reads one word's sales a day\.$/m);
    });

    it('says nothing of a word a day on a spent hourly window, another 429 of the same word call', async () => {
        const { code, stderr } = await bin(['beacon']);
        assert.equal(code, 1);
        assert.match(stderr, /60 calls an hour/);
        assert.doesNotMatch(stderr, /one word's sales a day/);
    });

    it('names the subscription, not the address, on RapidAPI\'s free Basic plan (review of lane N, 5)', async () => {
        const { code, stderr } = await bin(['lantern', '--rapidapi-key', 'rk', '--base', server.origin]);
        assert.equal(code, 1);
        assert.match(stderr, /^On RapidAPI's free Basic plan, one subscription reads one word's sales a day\.$/m);
        assert.doesNotMatch(stderr, /With no key/);
    });

    it('says in its help that an ending, --lengths and --movers go to the Domain Market listing on a RapidAPI key', async () => {
        const { stdout } = await bin(['--help']);
        assert.match(stdout, /an ending, --lengths and --movers go to the Domain Market listing/);
        assert.equal((stdout.match(/A RapidAPI key goes to the Domain Market listing\./g) ?? []).length, 2);
    });

    it('reads --lengths, --movers and --series on their calls', async () => {
        assert.deepEqual(JSON.parse((await bin(['--lengths'])).stdout), recorded('usecase-sales-lengths').data);
        assert.deepEqual(JSON.parse((await bin(['--movers'])).stdout), recorded('usecase-sales-movers').data);
        assert.deepEqual(JSON.parse((await bin(['--series', 'month'])).stdout), recorded('usecase-sales-series').data);
    });

    it('sends the endings to the Domain Market listing on a RapidAPI key', async () => {
        await bin(['.com', '--rapidapi-key', 'rk', '--base', server.base]);
        assert.equal(last().headers['x-rapidapi-host'], 'domain-market.p.rapidapi.com');
        await bin(['harbor', '--rapidapi-key', 'rk', '--base', server.base]);
        assert.equal(last().headers['x-rapidapi-host'], 'domain-sales-history1.p.rapidapi.com');
    });

    it('refuses two arguments, and a mode with an argument, before any call', async () => {
        const before = server.requests.length;
        assert.equal((await bin(['harbor', 'lantern'])).code, 2);
        assert.equal((await bin(['harbor', '--movers'])).code, 2);
        assert.equal((await bin(['--movers', '--lengths'])).code, 2);
        assert.equal(server.requests.length, before);
    });
});
