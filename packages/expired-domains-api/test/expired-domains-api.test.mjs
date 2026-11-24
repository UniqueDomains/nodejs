import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { drops, expiring, PlanRequiredError, ValidationError } from '../dist/index.js';
import { FOUNDER_KEY, loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const KEY = 'ud_live_usecase';
const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const last = () => server.requests.at(-1);
const bin = (args, env = {}) => runBin('expired-domains-api', args, { UD_API_BASE: server.base, ...env });

describe('expired-domains-api', () => {
    it('reads the day\'s drops for free, sending no key: counts, never a name', async () => {
        const day = await drops(free());
        assert.deepEqual(day, recorded('usecase-drops').data);
        assert.equal(last().path, '/v1/domains/drops');
        assert.equal(last().query, '');
        assert.equal(last().headers.authorization, undefined);
        assert.equal(day.sample.every((row) => !('name' in row)), true);
    });

    it('writes the endings as the API reads them: no dot, lowercased, one comma list', async () => {
        await drops({ ...free(), ending: ['.IO'] });
        assert.equal(last().query, 'ending=io');
        await drops({ ...free(), ending: '' }).catch(() => {});
        assert.equal(last().query, '', 'an empty ending sends none');
    });

    it('passes the API\'s refusal of a day outside the week on as a ValidationError, with its message (side path)', async () => {
        await assert.rejects(drops({ ...free(), day: '2020-01-01' }), (error) => {
            assert.ok(error instanceof ValidationError);
            assert.equal(error.detail, recorded('usecase-drops-day-refused').detail);
            return true;
        });
    });

    it('passes the API\'s refusal of a malformed ending on as a ValidationError (side path)', async () => {
        await assert.rejects(drops({ ...free(), ending: 'i_o' }), (error) => {
            assert.ok(error instanceof ValidationError);
            assert.equal(error.detail, recorded('usecase-drops-ending-malformed').detail);
            return true;
        });
    });

    it('reads the names of a drop day with a key on the Investor plan, a page at a time', async () => {
        const names = [];
        for await (const row of drops({ apiKey: KEY, baseUrl: server.base, ending: 'io' })) names.push(row.name);
        assert.deepEqual(names, ['anchor.example', 'beacon.example']);
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
    });

    it('throws PlanRequiredError on expiring() without a key (side path)', async () => {
        await assert.rejects(expiring(free()), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'keyed_only');
            return true;
        });
    });

    it('throws PlanRequiredError on expiring() with a Founder key: it is an Investor endpoint', async () => {
        await assert.rejects(expiring({ apiKey: FOUNDER_KEY, baseUrl: server.base }), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'plan_required');
            return true;
        });
    });

    it('reads the expiring names with a key', async () => {
        const rows = await expiring({ apiKey: KEY, baseUrl: server.base });
        assert.equal(rows[0].name, 'anchor.example');
    });
});

describe('ud-expired', () => {
    it('prints the day\'s drops as JSON in a pipe, with no argument', async () => {
        const { code, stdout } = await bin([]);
        assert.equal(code, 0);
        assert.deepEqual(JSON.parse(stdout), recorded('usecase-drops').data);
    });

    it('says, without a key, that --ending narrows only the names, and prints the counts of every ending', async () => {
        const { code, stdout, stderr } = await bin(['--ending', '.io']);
        assert.equal(code, 0);
        assert.equal(JSON.parse(stdout).count, recorded('usecase-drops').data.count);
        assert.match(stderr, /With no key the counts cover every ending: --ending narrows the names, with a key on the Investor plan\./);
    });

    it('prints no such note with a key', async () => {
        const { stderr } = await bin(['--ending', 'io', '--key', KEY]);
        assert.doesNotMatch(stderr, /With no key/);
    });

    it('prints the API\'s refusal of a day outside the week and exits 1', async () => {
        const { code, stderr } = await bin(['--day', '2020-01-01']);
        assert.equal(code, 1);
        assert.ok(stderr.includes(recorded('usecase-drops-day-refused').detail));
    });

    it('prints the plan\'s refusal on --expiring without a key', async () => {
        const { code, stderr } = await bin(['--expiring']);
        assert.equal(code, 1);
        assert.match(stderr, /needs a Pro, Ultra or Mega subscription, or a member key/);
    });

    it('refuses an argument, and a flag of the other mode, before any call', async () => {
        const before = server.requests.length;
        assert.equal((await bin(['io'])).code, 2);
        assert.equal((await bin(['--expiring', '--day', '2026-11-25'])).code, 2);
        assert.equal((await bin(['--after', '2026-11-25'])).code, 2);
        assert.equal(server.requests.length, before);
    });

    it('prints the help on --help only', async () => {
        const { code, stdout } = await bin(['--help']);
        assert.equal(code, 0);
        assert.match(stdout, /ud-expired --expiring --ending <endings>/);
    });
});
