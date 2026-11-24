import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesPrinted, recordedNames } from '../lib/recorded-names.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A copy of the repository's shape: one recorded answer and the README files given. */
const withRoot = (readmes, run) => {
    const root = mkdtempSync(join(tmpdir(), 'check-names-'));
    try {
        mkdirSync(join(root, 'test', 'fixtures', 'recorded'), { recursive: true });
        writeFileSync(join(root, 'test', 'fixtures', 'recorded', 'usecase-auction-sample.json'), JSON.stringify({
            name: 'usecase-auction-sample',
            response: { status: 200, body: { data: [{ name: 'orchard.example', venue: 'lanternhouse', venueLabel: 'Lantern House', bid: 120 }, { name: 'get.plumbing' }], meta: {} } },
        }));
        for (const [path, text] of Object.entries(readmes)) {
            mkdirSync(join(root, dirname(path)), { recursive: true });
            writeFileSync(join(root, path), text);
        }
        return run(spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' }));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
};

describe('scripts/check-text.mjs: no README prints a name from a recorded answer (npm unscoped names, lane N)', () => {
    it('finds the names and the venues in the tree\'s recorded answers', () => {
        const { names, venues } = recordedNames(ROOT);
        assert.ok(names.size > 0, 'the recorded answers carry names');
        assert.ok(venues.size > 0, 'the recorded answers carry venues');
    });

    it('reads the names under `name` and the venues, and leaves out the READMEs\' sample names', () => {
        const recorded = { names: new Set(['orchard.example']), venues: new Set(['lanternhouse', 'Lantern House']) };
        assert.deepEqual(namesPrinted('console.log(await auctionOf("orchard.example"));', 'README.md', recorded), ['orchard.example']);
        assert.deepEqual(namesPrinted('the orchard.examples of the day', 'README.md', recorded), [], 'a longer name is another name');
        assert.deepEqual(namesPrinted('Bid at Lantern House today.', 'packages/domain-auctions/README.md', recorded), ['Lantern House']);
        assert.deepEqual(namesPrinted('Bid at Lantern House today.', 'packages/whois/README.md', recorded), [], 'only the market READMEs');
    });

    it('fails on a README that prints a recorded name, and passes the sample name (mutation check)', () => {
        withRoot({ 'README.md': 'await auctionOf(\'get.plumbing\');\n' }, (result) => assert.equal(result.status, 0, result.stderr));
        withRoot({ 'README.md': 'One name at auction today: orchard.example.\n' }, (result) => {
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /README\.md:1: "orchard\.example" from a recorded answer/);
        });
    });

    it('fails on a market README that names a venue, and passes the same line in another README (mutation check)', () => {
        withRoot({ 'packages/domain-auctions/README.md': 'The day closes at Lantern House.\n' }, (result) => {
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /packages\/domain-auctions\/README\.md:1: "Lantern House"/);
        });
        withRoot({ 'packages/whois/README.md': 'Registered at Lantern House.\n' }, (result) => assert.equal(result.status, 0, result.stderr));
    });

    it('a fixture of a README example is a test file: it may carry the names', () => {
        withRoot({ 'README.md': 'The day.\n', 'test/support/sample.mjs': '// orchard.example\n' }, (result) => assert.equal(result.status, 0, result.stderr));
    });
});
