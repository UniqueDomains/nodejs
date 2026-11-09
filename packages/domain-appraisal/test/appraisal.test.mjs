import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { appraisal, appraise, comparableSales, PlanRequiredError } from '../dist/index.js';
import { FOUNDER_KEY, loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const KEY = 'ud_live_usecase';
const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body.data;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const keyed = () => ({ apiKey: KEY, baseUrl: server.base });
const last = () => server.requests.at(-1);

describe('@uniquedomains/domain-appraisal', () => {
    it('reads the comparable sales for free, sending no key', async () => {
        assert.deepEqual(await comparableSales('get.plumbing', free()), recorded('usecase-comps'));
        assert.equal(last().path, '/v1/names/get.plumbing/comps');
        assert.equal(last().headers.authorization, undefined);
    });

    it('answers harbor.io free, and throws PlanRequiredError for its value without a key (the plan\'s done line)', async () => {
        assert.equal((await comparableSales('harbor.io', free())).count, recorded('usecase-comps-untracked').count);
        await assert.rejects(appraisal('harbor.io', free()), PlanRequiredError);
    });

    it('sends the key on the stored value, by GET: it never starts a run', async () => {
        const { current } = await appraisal('get.plumbing', keyed());
        assert.equal(last().method, 'GET');
        assert.equal(last().path, '/v1/names/get.plumbing/value');
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.equal(current.value, 4200);
    });

    it('posts a fresh appraisal, with the key', async () => {
        const { current } = await appraise('get.plumbing', keyed());
        assert.equal(last().method, 'POST');
        assert.equal(last().path, '/v1/names/get.plumbing/appraise');
        assert.equal(current.value, 4200);
    });

    it('answers current null and status 202 on a run another call holds', async () => {
        const answer = await appraise('running.io', keyed()).withMeta();
        assert.equal(answer.status, 202);
        assert.equal(answer.data.current, null);
    });

    it('throws PlanRequiredError on a fresh appraisal with a Founder key or none', async () => {
        await assert.rejects(appraise('get.plumbing', { apiKey: FOUNDER_KEY, baseUrl: server.base }), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'plan_required');
            return true;
        });
        await assert.rejects(appraise('get.plumbing', free()), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'keyed_only');
            return true;
        });
    });
});

describe('ud-appraise', () => {
    const base = () => ['--base', server.base];

    it('on a run still going, says where the answer will be, never that no value is stored', async () => {
        const { code, stdout, stderr } = await runBin('domain-appraisal', ['running.io', '--run', '--no-json', '--key', KEY, ...base()]);
        assert.equal(code, 0);
        assert.doesNotMatch(stdout, /No value is stored/);
        assert.match(stderr, /Accepted: the full answer will be at https:\/\/api\.unique\.domains\/v1\/names\/running\.io\/value in about 30 seconds/);
    });

    it('prints the comparable sales first, as JSON in a pipe and as a table with --no-json', async () => {
        const json = await runBin('domain-appraisal', ['get.plumbing', ...base()]);
        assert.equal(json.code, 0);
        assert.deepEqual(JSON.parse(json.stdout), recorded('usecase-comps'));
        const table = await runBin('domain-appraisal', ['get.plumbing', '--no-json', ...base()]);
        assert.match(table.stdout, /^medianUsd\s+2677$/m);
    });

    it('says so when no sale is on record, and when no value is stored', async () => {
        const sales = await runBin('domain-appraisal', ['harbor.io', '--no-json', ...base()]);
        assert.equal(sales.stdout.trim(), 'No comparable sales are on record for harbor.io.');
        const value = await runBin('domain-appraisal', ['harbor.io', '--value', '--no-json', '--key', KEY, ...base()]);
        assert.equal(value.stdout.trim(), 'No value is stored for harbor.io.');
    });

    it('runs --value and --run with a key', async () => {
        assert.equal((await runBin('domain-appraisal', ['get.plumbing', '--value', '--key', KEY, ...base()])).code, 0);
        assert.equal(last().method, 'GET');
        assert.equal((await runBin('domain-appraisal', ['get.plumbing', '--run', '--key', KEY, ...base()])).code, 0);
        assert.equal(last().method, 'POST');
    });

    it('exits 1 on --value without a key, and 2 on both modes at once', async () => {
        assert.equal((await runBin('domain-appraisal', ['get.plumbing', '--value', ...base()])).code, 1);
        assert.equal((await runBin('domain-appraisal', ['get.plumbing', '--value', '--run', ...base()])).code, 2);
    });
});
