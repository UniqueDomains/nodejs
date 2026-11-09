import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderData, run } from '../dist/index.js';
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

/** A `fetch` that records the URL and headers it was asked for and answers one empty envelope: no server, no network. */
const recordingFetch = () => {
    const calls = [];
    const fetch = async (input, init) => {
        const request = new Request(input, init);
        calls.push({ url: request.url, headers: Object.fromEntries(request.headers) });
        return new Response(JSON.stringify({ data: {}, meta: { asOf: null, cursor: null, limit: null }, links: { self: request.url, next: null, register: null, product: null, dataset: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { calls, fetch };
};

const runWith = async (argv, io) => {
    let stdout = '';
    let stderr = '';
    const code = await run(argv, { stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } }, isTTY: false, columns: 120, env: {}, ...io });
    return { code, stdout, stderr };
};

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
        // No fixture answers this filter: the call ends in a 404, and only the request it sent matters here.
        const { code } = await ud(['list-tlds', '--limit', '3', '--public-set', '--iana-type', 'generic']);
        assert.equal(code, 1);
        const query = new URLSearchParams(lastRequest().query);
        assert.equal(query.get('limit'), '3');
        assert.equal(query.get('publicSet'), 'true');
        assert.equal(query.get('ianaType'), 'generic');
        await ud(['list-tlds', '--no-public-set']);
        assert.equal(new URLSearchParams(lastRequest().query).get('publicSet'), 'false');
    });

    it('accepts a command flag before the command (review finding 4)', async () => {
        const { code } = await ud(['--limit', '3', 'list-tlds']);
        assert.equal(code, 0);
        assert.equal(new URLSearchParams(lastRequest().query).get('limit'), '3');
    });

    it('reads --no-flag=true as false and --no-flag=false as true (review finding 5)', async () => {
        await ud(['list-tlds', '--no-public-set=true']);
        assert.equal(new URLSearchParams(lastRequest().query).get('publicSet'), 'false');
        await ud(['list-tlds', '--no-public-set=false']);
        assert.equal(new URLSearchParams(lastRequest().query).get('publicSet'), 'true');
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
        assert.match(stdout, /Word intakes {2}0 used of 0, 0 left/);
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

    it('uses the RapidAPI key and its listing host, with an explicit --base', async () => {
        const { code } = await ud(['--rapidapi-key', 'rk', '--listing', 'whois', '--base', server.origin, 'get-name-registry', 'harbor.io']);
        assert.equal(code, 0);
        assert.equal(lastRequest().headers['x-rapidapi-key'], 'rk');
        assert.equal(lastRequest().headers['x-rapidapi-host'], 'whois-lookup24.p.rapidapi.com');
        assert.equal(lastRequest().path, '/names/harbor.io/registry');
    });

    it('does not read UD_API_BASE for a RapidAPI key (review R1-23)', async () => {
        const { calls, fetch } = recordingFetch();
        await runWith(['--rapidapi-key', 'rk', '--listing', 'whois', 'get-name-registry', 'harbor.io'], { env: { UD_API_BASE: 'http://127.0.0.1:9/v1' }, fetch });
        assert.equal(new URL(calls[0].url).host, 'whois-lookup24.p.rapidapi.com');
        await runWith(['get-name', 'harbor.io'], { env: { UD_API_BASE: 'http://127.0.0.1:9/v1' }, fetch });
        assert.equal(calls[1].url, 'http://127.0.0.1:9/v1/names/harbor.io');
    });

    it('--verbose never prints a member or RapidAPI key, and shows Location on a 202', async () => {
        const member = await ud(['check-name', 'lantern.io', '--blocks', 'availability', '--key', 'ud_live_member_secret', '--verbose']);
        assert.equal(member.code, 0);
        assert.match(member.stderr, /< location: https:\/\/api\.unique\.domains\/v1\/names\/lantern\.io/);
        assert.match(member.stderr, /Accepted: the full answer will be at https:\/\/api\.unique\.domains\/v1\/names\/lantern\.io in about 30 seconds\./);
        assert.doesNotMatch(member.stderr, /ud_live_member_secret/);
        const rapid = await ud(['--rapidapi-key', 'rk_rapid_secret', '--listing', 'whois', '--base', server.origin, 'get-name-registry', 'harbor.io', '--verbose']);
        assert.equal(rapid.code, 0);
        assert.doesNotMatch(rapid.stderr, /rk_rapid_secret/);
    });

    it('ud whoami for a RapidAPI key prints its listing and subscription', async () => {
        const { code, stdout } = await ud(['whoami', '--rapidapi-key', 'rk', '--listing', 'whois', '--base', server.origin], { tty: true });
        assert.equal(code, 0);
        assert.match(stdout, /Access\s+RapidAPI/);
        assert.match(stdout, /Listing\s+whois/);
        assert.match(stdout, /Plan\s+BASIC/);
        assert.doesNotMatch(stdout, /Calls|Month/);
    });

    it('ud whoami with --fields prints only what came back (review R1-12)', async () => {
        const { code, stdout } = await ud(['whoami', '--key', 'k', '--fields', 'plan'], { tty: true });
        assert.equal(code, 0);
        assert.match(stdout, /plan\s+founder/);
        assert.doesNotMatch(stdout, /resets on|member key $/m);
    });

    it('prints "No data." for a null answer (review R1-12)', async () => {
        const { stdout } = await ud(['get-name', 'empty.io'], { tty: true });
        assert.equal(stdout.trim(), 'No data.');
    });

    it('ud enums prints nested lists as tables', async () => {
        const { code, stdout } = await ud(['enums'], { tty: true });
        assert.equal(code, 0);
        assert.match(stdout, /status\s+free, registered/);
        assert.match(stdout, /nested\.kinds \(1\)\nid\s+label\nregistry\s+Registry/);
    });

    it('--json=false prints a table into a pipe (review R1-19)', async () => {
        const { stdout } = await ud(['list-tlds', '--limit', '3', '--json=false']);
        assert.match(stdout.split('\n')[0], /^tld\s+slug/);
    });

    it('reads --body from a file', async () => {
        const file = join(mkdtempSync(join(tmpdir(), 'ud-body-')), 'body.json');
        writeFileSync(file, '{"names":["f.io"]}');
        const { code } = await ud(['batch-names', '--body', `@${file}`, '--key', 'k']);
        assert.equal(code, 0);
        assert.deepEqual(lastRequest().body, { names: ['f.io'] });
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
        assert.match(stderr, /not part of the WHOIS Lookup API listing/);
        assert.equal(server.requests.length, count);
    });

    it('exits 2 on a usage error, before any call (review R1-9, R1-10)', async () => {
        const count = server.requests.length;
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
            ['get-name', '-v', 'a.io'],
            ['resolve-word'],
            ['get-latest-edition', 'foundr'],
            ['get-iana-registrar', 'abc'],
            ['get-name', '..'],
            ['list-tlds', '--limit', '0x10'],
            ['batch-names', '--names', '', '--key', 'k'],
            ['batch-names', '--body', '@/nonexistent/body.json', '--key', 'k'],
            ['list-tlds', '--base', 'not a url'],
            ['list-tlds', '--base', 'ftp://example.test'],
            ['openapi', 'extra'],
        ]) {
            const { code, stderr } = await ud(argv);
            assert.equal(code, 2, argv.join(' '));
            assert.ok(stderr.length > 0, argv.join(' '));
            assert.doesNotMatch(stderr, /^\s+at /m, `${argv.join(' ')} printed a stack`);
        }
        assert.equal(server.requests.length, count);
    });

    it('names what is wrong, as the command was typed (review R1-10, R1-11, R1-19)', async () => {
        assert.match((await ud(['resolve-word'])).stderr, /resolve-word needs --q/);
        assert.match((await ud(['get-latest-edition', 'foundr'])).stderr, /<persona> takes one of: founder, investor/);
        assert.match((await ud(['get-iana-registrar', 'abc'])).stderr, /<id> takes a whole number/);
        assert.match((await ud(['whoami', 'x'])).stderr, /^whoami takes no argument/);
        const swallowed = await ud(['--key', 'whoami']);
        assert.equal(swallowed.code, 2);
        assert.equal(swallowed.stdout, '');
        assert.match(swallowed.stderr, /did --key take "whoami" as its value/);
        assert.match((await ud(['get-meta-tlds', '--listing', 'all'])).stderr, /--param-listing/);
    });

    it('lists an argument\'s values in its help (review R1-10)', async () => {
        assert.match((await ud(['list-registrar-prices', '--help'])).stdout, /<registrar>[\s\S]*One of: namecheap, name\.com/);
    });

    it('names an unknown short flag, and the missing body flag (review findings 6 and 10)', async () => {
        assert.match((await ud(['get-name', '-v', 'a.io'])).stderr, /Unknown flag -v/);
        assert.match((await ud(['batch-names', '--key', 'k'])).stderr, /batch-names needs --names/);
    });

    it('keeps the stack of a defect instead of calling it a network failure (review finding 7)', async () => {
        const broken = async () => { throw new TypeError('x is not a function'); };
        await assert.rejects(run(['get-name', 'a.io'], { stdout: { write: () => {} }, stderr: { write: () => {} }, env: {}, isTTY: false, columns: 80, fetch: broken }), /x is not a function/);
    });

    it('reports an unreachable API as such', async () => {
        const down = async () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }); };
        let stderr = '';
        const code = await run(['get-name', 'a.io'], { stdout: { write: () => {} }, stderr: { write: (text) => { stderr += text; } }, env: {}, isTTY: false, columns: 80, fetch: down });
        assert.equal(code, 1);
        assert.match(stderr, /Could not reach the API: connect ECONNREFUSED/);
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
        assert.match(stdout, /Domain Check API\n\s+get-name <name>\s+The stored answer for one domain name/);
        assert.match(stdout, /whoami/);
    });

    it('shows a command help', async () => {
        const { code, stdout } = await ud(['list-tlds', '--help']);
        assert.equal(code, 0);
        assert.match(stdout, /Usage: ud list-tlds \[flags\]/);
        assert.match(stdout, /--public-set/);
        assert.match(stdout, /Reference: https:\/\/unique\.domains\/api\/list-tlds/);
    });

    it('ud openapi --help explains the shortcut (review finding 9)', async () => {
        const { code, stdout } = await ud(['openapi', '--help']);
        assert.equal(code, 0);
        assert.match(stdout, /^Usage: ud openapi/);
    });

    it('the CommonJS entry runs a command', async () => {
        const { createRequire } = await import('node:module');
        const cli = createRequire(import.meta.url)('../dist/index.cjs');
        let stdout = '';
        const code = await cli.run(['get-name', 'harbor.io'], { stdout: { write: (text) => { stdout += text; } }, stderr: { write: () => {} }, env: { UD_API_BASE: server.base }, isTTY: false, columns: 80 });
        assert.equal(code, 0);
        assert.equal(JSON.parse(stdout).data.name, 'harbor.io');
    });

    it('prints the version and the snapshot', async () => {
        assert.match((await ud(['--version'])).stdout, /^\d+\.\d+\.\d+/);
        const { stdout } = await ud(['openapi']);
        assert.equal(JSON.parse(stdout).openapi, '3.1.0');
    });
});

describe('renderData', () => {
    it('says "1 row", keeps a nested list as its own table and counts empty fields', () => {
        const text = renderData({ name: 'a.io', id: null, extra: { deep: [{ x: 1 }, { x: 2 }] }, list: [[1], [2]] }, { width: 80 });
        assert.match(text, /^name\s+a\.io$/m);
        assert.match(text, /\(1 empty field: use --json to see every field\)/);
        assert.match(text, /extra\.deep \(2\)\nx\n1\n2/);
        assert.match(text, /list\s+2 rows/);
        assert.match(renderData({ list: [[1]] }, { width: 80 }), /list\s+1 row$/m);
        assert.equal(renderData(null, { width: 80 }), 'No data.');
        assert.equal(renderData({}, { width: 80 }), 'No data.');
    });

    it('points at --fields only when the command has it', () => {
        const wide = [{ a: 'x'.repeat(30), b: 'y'.repeat(30), c: 'z'.repeat(30) }];
        assert.match(renderData(wide, { width: 40, fieldsFlag: true }), /use --json, or --fields to choose/);
        assert.doesNotMatch(renderData(wide, { width: 40 }), /--fields/);
    });
});

describe('the ud bin (review R1-22)', () => {
    const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

    it('starts with a shebang and exits 0, 2 as documented', () => {
        assert.match(readFileSync(bin, 'utf8').split('\n')[0], /^#!\/usr\/bin\/env node$/);
        assert.equal(spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }).status, 0);
        const usage = spawnSync(process.execPath, [bin, 'get-name'], { encoding: 'utf8' });
        assert.equal(usage.status, 2);
        assert.match(usage.stderr, /get-name takes one argument/);
    });

    it('ends quietly when its reader closes the pipe', async () => {
        const child = spawn(process.execPath, [bin, 'openapi'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.stdout.once('data', () => child.stdout.destroy());
        const code = await new Promise((resolve) => child.on('close', resolve));
        assert.equal(code, 0);
        assert.doesNotMatch(stderr, /EPIPE/);
    });
});
