import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AVAILABILITY_FIELDS, availability, availabilityBatch, check, MAX_BATCH_NAMES, PlanRequiredError } from '../dist/index.js';
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

describe('@uniquedomains/domain-availability', () => {
    it('reads the stored answer for free, asking only for its fields', async () => {
        const answer = await availability('get.plumbing', free());
        assert.deepEqual(answer, recorded('usecase-availability'));
        assert.equal(last().method, 'GET');
        assert.equal(new URLSearchParams(last().query).get('fields'), AVAILABILITY_FIELDS.join(','));
        assert.equal(last().headers.authorization, undefined);
    });

    it('answers tracked false for a name the catalog never stored', async () => {
        const answer = await availability('harbor.io', free());
        assert.equal(answer.tracked, false);
        assert.equal(answer.status, 'not_checked');
    });

    it('posts the live check with the key', async () => {
        const answer = await check('zorbly.io', keyed());
        assert.equal(last().method, 'POST');
        assert.equal(last().path, '/v1/names/zorbly.io/check');
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.equal(answer.checked, true);
    });

    it('sends the blocks of a live check as its body', async () => {
        await check('zorbly.io', { ...keyed(), blocks: ['availability'] });
        assert.deepEqual(last().body, { blocks: ['availability'] });
    });

    it('throws PlanRequiredError on the live check without a key', async () => {
        await assert.rejects(check('zorbly.io', free()), PlanRequiredError);
    });

    it('posts many names in order, and answers one entry each', async () => {
        const names = ['zorbly.io', 'zorbly.ai', 'foo@bar.com'];
        const answers = await availabilityBatch(names, keyed());
        assert.deepEqual(last().body, { names });
        assert.deepEqual(answers.map((entry) => entry.name), names);
        assert.equal(answers[2].error, 'validation_failed');
    });

    it('throws PlanRequiredError on many names with a Founder key', async () => {
        await assert.rejects(availabilityBatch(['zorbly.io'], { apiKey: FOUNDER_KEY, baseUrl: server.base }), PlanRequiredError);
    });

    it('refuses a string, an empty list and one over the limit before any call', () => {
        const before = server.requests.length;
        assert.throws(() => availabilityBatch('get.plumbing', keyed()), TypeError);
        assert.throws(() => availabilityBatch(['a.io', 7], keyed()), /entry 1 is not a name/);
        assert.throws(() => availabilityBatch([], keyed()), RangeError);
        assert.throws(() => availabilityBatch(Array.from({ length: MAX_BATCH_NAMES + 1 }, (_, index) => `n${index}.io`), keyed()), /1 to 100 names, not 101/);
        assert.equal(server.requests.length, before);
    });
});

describe('ud-availability', () => {
    const base = () => ['--base', server.base];

    it('prints the stored answer, as JSON in a pipe and as a table with --no-json', async () => {
        const json = await runBin('domain-availability', ['get.plumbing', ...base()]);
        assert.equal(json.code, 0);
        assert.deepEqual(JSON.parse(json.stdout), recorded('usecase-availability'));
        const table = await runBin('domain-availability', ['get.plumbing', '--no-json', ...base()]);
        assert.match(table.stdout, /^status\s+for_sale$/m);
    });

    it('says what an untracked name means instead of an empty table', async () => {
        const { stdout } = await runBin('domain-availability', ['harbor.io', '--no-json', ...base()]);
        assert.match(stdout, /harbor\.io is not in the catalog yet/);
    });

    it('runs the live check with --check, and a batch with several names', async () => {
        const checked = await runBin('domain-availability', ['zorbly.io', '--check', '--key', KEY, ...base()]);
        assert.equal(checked.code, 0);
        assert.equal(last().path, '/v1/names/zorbly.io/check');
        const batch = await runBin('domain-availability', ['zorbly.io', 'zorbly.ai', '--key', KEY, ...base()]);
        assert.equal(batch.code, 0);
        assert.deepEqual(last().body, { names: ['zorbly.io', 'zorbly.ai'] });
    });

    it('exits 1 on --check without a key, and 2 on arguments that cannot call', async () => {
        const refused = await runBin('domain-availability', ['zorbly.io', '--check', ...base()]);
        assert.equal(refused.code, 1);
        const before = server.requests.length;
        assert.equal((await runBin('domain-availability', ['a.io', 'b.io', '--check', '--key', KEY, ...base()])).code, 2);
        const overLimit = await runBin('domain-availability', [...Array.from({ length: 101 }, (_, index) => `n${index}.io`), '--key', KEY, ...base()]);
        assert.equal(overLimit.code, 2);
        assert.equal(overLimit.stderr, 'Give 1 to 100 names, not 101. Run ud-availability --help.\n');
        assert.equal((await runBin('domain-availability', ['--json'])).code, 2);
        assert.equal(server.requests.length, before);
    });
});
