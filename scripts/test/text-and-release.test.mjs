import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('scripts/release-notes.mjs (review R1-4)', () => {
    it('refuses a pre-release tag and a malformed one', () => {
        for (const tag of ['v0.1.0-beta.1', '0.1.0', 'v0.1']) {
            const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'release-notes.mjs'), tag], { encoding: 'utf8' });
            assert.notEqual(result.status, 0, tag);
            assert.match(result.stderr, /no pre-release tags/, tag);
        }
    });
});

describe('scripts/release-notes.mjs over every package (plan lane N2)', () => {
    it('refuses a tag no package is at, naming the package', () => {
        const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'release-notes.mjs'), 'v9.9.9'], { encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /packages\/sdk is /);
    });
});

describe('scripts/list-packages.mjs (plan lane N2)', () => {
    it('prints the six packages, the SDK first', () => {
        const folders = execFileSync(process.execPath, [join(ROOT, 'scripts', 'list-packages.mjs')], { encoding: 'utf8' }).trim().split('\n');
        assert.equal(folders[0], 'sdk');
        assert.deepEqual([...folders].sort(), ['cli', 'domain-appraisal', 'domain-availability', 'registrar-prices', 'sdk', 'whois']);
    });
});

describe('scripts/check-text.mjs (review R1-13)', () => {
    it('passes on the tree', () => {
        assert.match(execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs')], { encoding: 'utf8' }), /The text rules hold/);
    });
});
