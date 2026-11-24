import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { auctionOf, auctionOutcomes, auctions, auctionSample, auctionVenues, PlanRequiredError } from '../dist/index.js';
import { FOUNDER_KEY, loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const KEY = 'ud_live_usecase';
const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const last = () => server.requests.at(-1);
const bin = (args, env = {}) => runBin('domain-auctions', args, { UD_API_BASE: server.base, ...env });

describe('domain-auctions', () => {
    it('reads the day for free, sending no key', async () => {
        assert.deepEqual(await auctions(free()), recorded('usecase-auctions').data);
        assert.equal(last().path, '/v1/market/auctions');
        assert.equal(last().headers.authorization, undefined);
    });

    it('reads the sample and the venues for free', async () => {
        const sample = await auctionSample(free());
        assert.equal(last().path, '/v1/market/auctions/sample');
        assert.ok(sample.length > 0 && sample.length <= 20);
        assert.deepEqual(await auctionVenues(free()), recorded('usecase-auction-venues').data);
        assert.equal(last().path, '/v1/market/auctions/venues');
    });

    it('answers null for a name with no open auction (side path)', async () => {
        assert.equal(await auctionOf('get.plumbing', free()), null);
        assert.equal(last().path, '/v1/names/get.plumbing/auction');
    });

    it('throws PlanRequiredError on auctionOutcomes() without a key (side path)', async () => {
        await assert.rejects(auctionOutcomes(free()), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'keyed_only');
            return true;
        });
    });

    it('throws PlanRequiredError on auctionOutcomes() with a Founder key: it is an Investor endpoint', async () => {
        await assert.rejects(auctionOutcomes({ apiKey: FOUNDER_KEY, baseUrl: server.base }), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'plan_required');
            return true;
        });
    });

    it('reads the outcomes with a key, sending it', async () => {
        const rows = await auctionOutcomes({ apiKey: KEY, baseUrl: server.base });
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.equal(rows[0].count, 42);
    });
});

describe('ud-auctions', () => {
    it('prints the day with no argument', async () => {
        const { code, stdout } = await bin([]);
        assert.equal(code, 0);
        assert.deepEqual(JSON.parse(stdout), recorded('usecase-auctions').data);
    });

    it('prints "No open auction" for a name with none, on a terminal, and null in a pipe (side path)', async () => {
        const table = await bin(['get.plumbing', '--no-json']);
        assert.equal(table.code, 0);
        assert.match(table.stdout, /^No open auction for get\.plumbing\.$/m);
        assert.equal((await bin(['get.plumbing'])).stdout.trim(), 'null');
    });

    it('reads --sample and --venues on their calls', async () => {
        await bin(['--sample']);
        assert.equal(last().path, '/v1/market/auctions/sample');
        assert.deepEqual(JSON.parse((await bin(['--venues'])).stdout), recorded('usecase-auction-venues').data);
    });

    it('prints the plan\'s refusal on --outcomes without a key', async () => {
        const { code, stderr } = await bin(['--outcomes']);
        assert.equal(code, 1);
        assert.match(stderr, /needs a Pro, Ultra or Mega subscription, or a member key/);
    });

    it('refuses two names, and a mode with a name, before any call', async () => {
        const before = server.requests.length;
        assert.equal((await bin(['a.io', 'b.io'])).code, 2);
        assert.equal((await bin(['a.io', '--sample'])).code, 2);
        assert.equal((await bin(['--sample', '--venues'])).code, 2);
        assert.equal(server.requests.length, before);
    });
});
