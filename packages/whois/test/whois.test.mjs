import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient, dns, PlanRequiredError, whois, whoisHistory } from '../dist/index.js';
import { FOUNDER_KEY, loadRecorded, startFixtureServer } from '../../../test/support/fixture-server.mjs';
import { runBin } from '../../../test/support/run-bin.mjs';

const KEY = 'ud_live_usecase';
const recorded = (name) => loadRecorded().find((fixture) => fixture.name === name).response.body.data;

let server;
before(async () => { server = await startFixtureServer(); });
after(() => server.close());

const free = () => ({ apiKey: null, baseUrl: server.base });
const last = () => server.requests.at(-1);

describe('@uniquedomains/whois', () => {
    it('reads the registry record for free, sending no key', async () => {
        assert.deepEqual(await whois('get.plumbing', free()), recorded('usecase-registry'));
        assert.equal(last().path, '/v1/names/get.plumbing/registry');
        assert.equal(last().headers.authorization, undefined);
    });

    it('reads the DNS for free', async () => {
        assert.deepEqual(await dns('get.plumbing', free()), recorded('usecase-dns'));
        assert.equal(last().path, '/v1/names/get.plumbing/dns');
    });

    it('sends the key on the history, and answers its data', async () => {
        const history = await whoisHistory('zorbly.io', { apiKey: KEY, baseUrl: server.base });
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        assert.equal(history.moves[0].to, 'Gandi SAS');
    });

    it('throws PlanRequiredError on the history without a key', async () => {
        await assert.rejects(whoisHistory('zorbly.io', free()), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'keyed_only');
            return true;
        });
    });

    it('throws PlanRequiredError on the history with a Founder key: it is an Investor endpoint', async () => {
        await assert.rejects(whoisHistory('zorbly.io', { apiKey: FOUNDER_KEY, baseUrl: server.base }), (error) => {
            assert.ok(error instanceof PlanRequiredError);
            assert.equal(error.code, 'plan_required');
            return true;
        });
    });

    it('sends headers on the call when it is given a client', async () => {
        const client = createClient({ apiKey: null, baseUrl: server.base });
        await whois('get.plumbing', { client, headers: { 'x-trace': 'abc' } });
        assert.equal(last().headers['x-trace'], 'abc');
    });

    it('refuses a client with a connection option beside it, before any call', () => {
        const client = createClient({ apiKey: null, baseUrl: server.base });
        const before = server.requests.length;
        assert.throws(() => whois('get.plumbing', { client, apiKey: KEY }), /either client or apiKey, not both/);
        assert.throws(() => whois('get.plumbing', { client, baseUrl: server.base, retry: true }), /either client or baseUrl, retry, not both/);
        assert.equal(server.requests.length, before);
    });

    it('reads a key from the environment, as the SDK does', async () => {
        process.env.UD_API_KEY = KEY;
        try {
            await whoisHistory('zorbly.io', { baseUrl: server.base });
            assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        } finally {
            delete process.env.UD_API_KEY;
        }
    });

    it('splits a call option from the connection, and reuses a client it is given', async () => {
        const client = createClient({ apiKey: null, baseUrl: server.base });
        await whois('harbor.io', { client, fields: ['read', 'registrar'] }).then(() => assert.fail('no fixture for this projection'), (error) => assert.equal(error.code, 'not_found'));
        assert.equal(last().query, 'fields=read%2Cregistrar');
    });
});

describe('ud-whois', () => {
    const base = () => ['--base', server.base];

    it('prints the record as JSON in a pipe', async () => {
        const { code, stdout } = await runBin('whois', ['get.plumbing', ...base()]);
        assert.equal(code, 0);
        assert.deepEqual(JSON.parse(stdout), recorded('usecase-registry'));
    });

    it('prints a table with --no-json', async () => {
        const { code, stdout } = await runBin('whois', ['get.plumbing', '--no-json', ...base()]);
        assert.equal(code, 0);
        assert.match(stdout, /^registrar\.name\s+GoDaddy\.com, LLC$/m);
        assert.match(stdout, /^eppStatuses \(4\)$/m);
    });

    it('says so when no record is stored, and --json still prints the empty record', async () => {
        const table = await runBin('whois', ['harbor.io', '--no-json', ...base()]);
        assert.equal(table.stdout.trim(), 'No registry record is stored for harbor.io.');
        const json = await runBin('whois', ['harbor.io', '--json', ...base()]);
        assert.equal(JSON.parse(json.stdout).read, false);
    });

    it('sends --key on --history, and reads UD_API_KEY', async () => {
        const flag = await runBin('whois', ['zorbly.io', '--history', '--key', KEY, ...base()]);
        assert.equal(flag.code, 0);
        assert.equal(last().headers.authorization, `Bearer ${KEY}`);
        const env = await runBin('whois', ['zorbly.io', '--history', ...base()], { UD_API_KEY: KEY });
        assert.equal(env.code, 0);
    });

    it('exits 1 with the detail and the link when the API refuses', async () => {
        const { code, stdout, stderr } = await runBin('whois', ['zorbly.io', '--history', ...base()]);
        assert.equal(code, 1);
        assert.equal(stdout, '');
        assert.match(stderr, /needs a Pro, Ultra or Mega subscription, or a member key/);
        assert.match(stderr, /See: https:\/\/unique\.domains\/pricing/);
    });

    it('exits 2 on a usage error and makes no call', async () => {
        const before = server.requests.length;
        for (const args of [['a.io', 'b.io'], ['a.io', '--nope'], ['a.io', '--key'], ['--key', 'k'], ['a.io', '--json=maybe'], ['a.io', '--base', 'ftp://x'], ['..'], ['...'], [' '], [''], ['a.io', '--listing', 'whois']]) {
            const { code, stderr } = await runBin('whois', args);
            assert.equal(code, 2, args.join(' '));
            assert.match(stderr, /Run ud-whois --help/);
        }
        assert.equal(server.requests.length, before);
    });

    it('picks one key: two from the same place are refused', async () => {
        const flags = await runBin('whois', ['a.io', '--key', 'a', '--rapidapi-key', 'b']);
        assert.equal(flags.code, 2);
        const env = await runBin('whois', ['a.io'], { UD_API_KEY: 'a', UD_RAPIDAPI_KEY: 'b' });
        assert.equal(env.code, 2);
    });

    it('sends a RapidAPI key to its listing, whois by default', async () => {
        const { code, stdout } = await runBin('whois', ['harbor.io', '--rapidapi-key', 'rk', '--base', server.origin]);
        assert.equal(code, 0, stdout);
        assert.equal(last().headers['x-rapidapi-host'], 'whois-lookup24.p.rapidapi.com');
        assert.equal(last().headers['x-rapidapi-key'], 'rk');
        const fromEnv = await runBin('whois', ['harbor.io', '--rapidapi-key', 'rk', '--base', server.origin], { UD_RAPIDAPI_LISTING: 'registrars' });
        assert.equal(fromEnv.code, 0, 'a listing set for ud in the environment never reaches this command');
        assert.equal(last().headers['x-rapidapi-host'], 'whois-lookup24.p.rapidapi.com');
        const unknown = await runBin('whois', ['harbor.io', '--rapidapi-key', 'rk', '--listing', 'nope']);
        assert.equal(unknown.code, 2);
    });

    it('prints help and the version without a call, and help with no argument', async () => {
        for (const args of [[], ['--help'], ['-h']]) {
            const { code, stdout } = await runBin('whois', args);
            assert.equal(code, 0);
            assert.match(stdout, /Usage:\n {2}ud-whois <name>/);
            assert.match(stdout, /--history/);
        }
        const { stdout } = await runBin('whois', ['--version']);
        assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
    });

    it('says the API cannot be reached when the network fails', async () => {
        const { code, stderr } = await runBin('whois', ['get.plumbing', '--base', 'http://127.0.0.1:9/v1']);
        assert.equal(code, 1);
        assert.match(stderr, /Could not reach the API/);
    });

    it('never prints the key', async () => {
        const { stdout, stderr } = await runBin('whois', ['zorbly.io', '--history', '--key', KEY, ...base()]);
        assert.doesNotMatch(stdout + stderr, new RegExp(KEY));
    });
});
