import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { run } from '../dist/index.js';
import { startFixtureServer } from '../../../test/support/fixture-server.mjs';

let server;
before(async () => { server = await startFixtureServer(); });
after(async () => { await server.close(); });

const ud = async (argv, { tty = false, env = {}, stdin = '' } = {}) => {
    let stdout = '';
    let stderr = '';
    const code = await run(argv, {
        stdout: { write: (text) => { stdout += text; } },
        stderr: { write: (text) => { stderr += text; } },
        env: { UD_API_BASE: server.base, ...env },
        isTTY: tty,
        columns: 120,
        readStdin: async () => stdin,
    });
    return { code, stdout, stderr };
};
const lastRequest = () => server.requests.at(-1);

describe('ud: answers', () => {
    it('prints the envelope as JSON when stdout is not a terminal', async () => {
        const { code, stdout } = await ud(['get-name', 'harbor.io']);
        assert.equal(code, 0);
        const envelope = JSON.parse(stdout);
        assert.equal(envelope.data.name, 'harbor.io');
        assert.ok('meta' in envelope && 'links' in envelope);
    });

    it('prints a table on a terminal, and JSON with --json', async () => {
        const table = await ud(['list-tlds', '--limit', '3'], { tty: true });
        assert.equal(table.code, 0);
        assert.match(table.stdout.split('\n')[0], /^tld\s+slug/);
        assert.match(table.stdout, /Next page: ud list-tlds \.\.\. --cursor /);
        const json = await ud(['list-tlds', '--limit', '3', '--json'], { tty: true });
        assert.equal(JSON.parse(json.stdout).data.length, 3);
    });

    it('turns query flags into the query', async () => {
        await ud(['list-tlds', '--limit', '3', '--public-set', '--iana-type', 'generic']).catch(() => undefined);
        const query = new URLSearchParams(lastRequest().query);
        assert.equal(query.get('limit'), '3');
        assert.equal(query.get('publicSet'), 'true');
        assert.equal(query.get('ianaType'), 'generic');
        await ud(['list-tlds', '--no-public-set']);
        assert.equal(new URLSearchParams(lastRequest().query).get('publicSet'), 'false');
    });

    it('prints the CSV form with --csv', async () => {
        const { code, stdout } = await ud(['list-tlds', '--limit', '3', '--csv']);
        assert.equal(code, 0);
        assert.match(stdout, /^tld,/);
        assert.equal(lastRequest().path, '/v1/tlds.csv');
    });

    it('prints the register and dataset links under a table', async () => {
        const { stdout } = await ud(['get-name', 'open.io'], { tty: true });
        assert.match(stdout, /Register: https:\/\/app\.unique\.domains\/domain\/dom_1\/go\/porkbun/);
        assert.match(stdout, /Dataset: https:\/\/github\.com\/UniqueDomains\/io-domains/);
    });

    it('ud whoami prints the plan, the month and what is left', async () => {
        const { code, stdout } = await ud(['whoami', '--key', 'ud_live_test'], { tty: true });
        assert.equal(code, 0);
        assert.equal(lastRequest().headers.authorization, 'Bearer ud_live_test');
        assert.match(stdout, /Plan\s+founder/);
        assert.match(stdout, /Month\s+2026-11, resets on 2026-12-01/);
        assert.match(stdout, /Calls\s+412 used of 10000, 9588 left/);
    });

    it('--verbose prints the request and the quota headers on stderr, never the key', async () => {
        const { stderr } = await ud(['whoami', '--verbose'], { env: { UD_API_KEY: 'ud_live_secret' } });
        assert.match(stderr, /> GET .*\/v1\/meta\/key/);
        assert.match(stderr, /< x-quota-remaining: 9588/);
        assert.doesNotMatch(stderr, /ud_live_secret/);
    });

    it('sends body flags and --body as JSON', async () => {
        await ud(['batch-names', '--names', 'a.io,b.io', '--names', 'c.io', '--key', 'k']);
        assert.deepEqual(lastRequest().body, { names: ['a.io', 'b.io', 'c.io'] });
        await ud(['batch-names', '--body', '{"names":["d.io"]}', '--key', 'k']);
        assert.deepEqual(lastRequest().body, { names: ['d.io'] });
        await ud(['batch-names', '--body', '-', '--key', 'k'], { stdin: '{"names":["e.io"]}' });
        assert.deepEqual(lastRequest().body, { names: ['e.io'] });
    });

    it('uses the RapidAPI key and its listing host', async () => {
        await ud(['--rapidapi-key', 'rk', '--listing', 'whois', 'get-name-registry', 'harbor.io']);
        assert.equal(lastRequest().headers['x-rapidapi-key'], 'rk');
        assert.equal(lastRequest().headers['x-rapidapi-host'], 'whois-lookup24.p.rapidapi.com');
    });
});

describe('ud: problems and usage', () => {
    it('exits 1 with the problem detail on stderr', async () => {
        const { code, stdout, stderr } = await ud(['get-name-prices', 'harbor.io']);
        assert.equal(code, 1);
        assert.equal(stdout, '');
        assert.match(stderr, /needs a Pro, Ultra or Mega subscription, or a member key/);
        assert.match(stderr, /See: https:\/\/unique\.domains\/pricing/);
    });

    it('exits 1 on a listing mismatch, before any call', async () => {
        const count = server.requests.length;
        const { code, stderr } = await ud(['--rapidapi-key', 'rk', '--listing', 'whois', 'get-name', 'harbor.io']);
        assert.equal(code, 1);
        assert.match(stderr, /not part of the WHOIS Lookup listing/);
        assert.equal(server.requests.length, count);
    });

    it('exits 2 on a usage error', async () => {
        for (const argv of [
            ['get-name'],
            ['get-name', 'a.io', 'b.io'],
            ['get-nam', 'a.io'],
            ['list-tlds', '--limit', 'ten'],
            ['list-tlds', '--iana-status', 'nope'],
            ['get-name', 'a.io', '--limit', '3'],
            ['get-name', 'a.io', '--csv'],
            ['batch-names', '--key', 'k'],
            ['get-name', 'a.io', '--key', 'k', '--rapidapi-key', 'rk', '--listing', 'whois'],
            ['get-name', 'a.io', '--rapidapi-key', 'rk'],
            ['get-name', 'a.io', '--listing', 'whois'],
        ]) {
            const { code, stderr } = await ud(argv);
            assert.equal(code, 2, argv.join(' '));
            assert.ok(stderr.length > 0, argv.join(' '));
        }
    });

    it('refuses two keys from the environment', async () => {
        const { code, stderr } = await ud(['get-name', 'a.io'], { env: { UD_API_KEY: 'k', UD_RAPIDAPI_KEY: 'rk' } });
        assert.equal(code, 2);
        assert.match(stderr, /both set/);
    });
});

describe('ud: help, version, openapi', () => {
    it('lists commands by API with summaries', async () => {
        const { code, stdout } = await ud(['--help']);
        assert.equal(code, 0);
        assert.match(stdout, /Domain Check\n\s+get-name <name>\s+The stored answer for one domain name/);
        assert.match(stdout, /whoami/);
    });

    it('shows a command help', async () => {
        const { code, stdout } = await ud(['list-tlds', '--help']);
        assert.equal(code, 0);
        assert.match(stdout, /Usage: ud list-tlds \[flags\]/);
        assert.match(stdout, /--public-set/);
        assert.match(stdout, /Reference: https:\/\/unique\.domains\/api\/list-tlds/);
    });

    it('prints the version and the snapshot', async () => {
        assert.match((await ud(['--version'])).stdout, /^\d+\.\d+\.\d+/);
        const { stdout } = await ud(['openapi']);
        assert.equal(JSON.parse(stdout).openapi, '3.1.0');
    });
});
