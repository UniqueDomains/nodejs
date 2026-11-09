import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadRecorded, startFixtureServer } from '../../test/support/fixture-server.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'record-fixtures.mjs');

/** Runs the recorder against a local server, into its own folder. Never the live API. */
const record = (base, out) => new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, '--only', 'tlds-public-set'], { env: { ...process.env, UD_API_BASE: base, UD_FIXTURES_OUT: out } }, (error, stdout, stderr) => resolve({ failed: Boolean(error), stderr }));
});

describe('scripts/record-fixtures.mjs: a list of pages (review m9)', () => {
    const pageTwo = loadRecorded().find((fixture) => fixture.name === 'tlds-public-set-2');
    let out;
    before(() => { out = mkdtempSync(join(tmpdir(), 'ud-record-')); });
    after(() => { rmSync(out, { recursive: true, force: true }); });

    it('writes every page and removes a stale one', async () => {
        const server = await startFixtureServer();
        try {
            writeFileSync(join(out, 'tlds-public-set-4.json'), '{}');
            assert.equal((await record(server.base, out)).failed, false);
            assert.deepEqual(readdirSync(out).sort(), ['tlds-public-set-1.json', 'tlds-public-set-2.json', 'tlds-public-set-3.json']);
        } finally {
            await server.close();
        }
    });

    it('writes nothing when a page is refused, and keeps the old files', async () => {
        const refused = { name: 'refused-page', request: pageTwo.request, response: { status: 429, headers: { 'content-type': 'application/problem+json', 'retry-after': '60' }, body: { code: 'rate_limited', detail: 'x' } } };
        const server = await startFixtureServer([refused]);
        try {
            const folder = mkdtempSync(join(tmpdir(), 'ud-record-'));
            writeFileSync(join(folder, 'tlds-public-set-1.json'), '{"old":true}');
            const { failed, stderr } = await record(server.base, folder);
            assert.equal(failed, true);
            assert.match(stderr, /tlds-public-set-2 answered 429: nothing written/);
            assert.deepEqual(readdirSync(folder), ['tlds-public-set-1.json']);
            rmSync(folder, { recursive: true, force: true });
        } finally {
            await server.close();
        }
    });
});
