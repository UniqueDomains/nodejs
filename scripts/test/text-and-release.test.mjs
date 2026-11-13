import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestOf, packageFolders, PLACEHOLDER_VERSION, placeholderManifest } from '../lib/packages.mjs';
import { brokenBy, isReaderFile, joinedText } from '../lib/text-rules.mjs';

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

describe('the placeholder of a new package (Gaetan\'s 1A)', () => {
    const whois = manifestOf('whois');
    const placeholder = placeholderManifest(whois);

    it('names the package and holds nothing that runs', () => {
        assert.equal(placeholder.name, '@uniquedomains/whois');
        assert.equal(placeholder.version, '0.0.1');
        assert.deepEqual(placeholder.repository, whois.repository);
        assert.equal(placeholder.publishConfig.access, 'public');
        for (const key of ['bin', 'dependencies', 'scripts', 'main', 'exports', 'files']) assert.equal(placeholder[key], undefined, key);
    });

    it('sits below every real version, so the tag\'s becomes latest', () => {
        const parts = (version) => version.split('.').map(Number);
        for (const folder of packageFolders()) {
            const [major, minor, patch] = parts(manifestOf(folder).version);
            const [low, mid, high] = parts(PLACEHOLDER_VERSION);
            assert.ok(major > low || (major === low && (minor > mid || (minor === mid && patch > high))), folder);
        }
    });

    it('refuses an unknown option before reading the registry', () => {
        const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'publish-placeholder.mjs'), '--publish'], { encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Unknown option --publish/);
    });
});

describe('scripts/list-packages.mjs (plan lane N2)', () => {
    it('prints every package folder, the SDK first', () => {
        const folders = execFileSync(process.execPath, [join(ROOT, 'scripts', 'list-packages.mjs')], { encoding: 'utf8' }).trim().split('\n');
        assert.equal(folders[0], 'sdk');
        assert.deepEqual([...folders].sort(), readdirSync(join(ROOT, 'packages')).filter((folder) => existsSync(join(ROOT, 'packages', folder, 'package.json'))).sort());
    });
});

describe('scripts/check-text.mjs (review R1-13)', () => {
    it('passes on the tree', () => {
        assert.match(execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs')], { encoding: 'utf8' }), /The text rules hold/);
    });
});

describe('scripts/check-text.mjs, the three rules (plan "never where data comes from", lane N)', () => {
    const banned = [
        'The stored answer for one domain name.',
        'The answer comes from storage.',
        'refreshed by the same scanner',
        'Free, read from storage, never live.',
        'A stored record, not a live lookup.',
        'Stored data as of its day.',
        'An answer carries its day where the record has one.',
        'The latest stored DNS reading, with the day it was read.',
        'nameservers as clean JSON, with the day of the record.',
        'How current each part of the data is.',
        'The 2026 new gTLD round as ICANN publishes it.',
        'Written by an AI editor from the sources above.',
        // One sample per alternative, so a typo in any of them fails here (review of lane N, finding 3).
        'Kept in sync with the registry.',
        'The CLI reads live data.',
        'Read the name live.',
        'Live reads come back at 00:00 UTC.',
        'Reads the name live from its registry and a registrar.',
        'A live registry check needs a key.',
        "The registry's word right now.",
        'the day it is from',
        'the totals on the latest day',
        'on the latest footprint day',
        'checked on 3 Oct',
        'Checked just now',
        'Rescanned on a rolling schedule.',
        '505 endings, each with its dates.',
        'answers are dated by day',
        'each answer with its day',
        'with its day',
        'when its estimate is missing or out of date',
        '## A fresh appraisal',
        'none on a fresh estimate',
        'That answer (2026-11-11, trimmed) comes from a record.',
        'a median of $2,677 (2026-11-11).',
        '"Is get.plumbing taken?" answered on 2026-11-11',
        'An AI-written summary.',
        'an AI estimate by the vendor',
        'written by Claude models from a research corpus',
    ];
    const kept = [
        'A live check with a key.',
        'Runs a live check of the name and returns the full answer.',
        'from a record of 37 million names read every day',
        'its price today and its renewal price',
        'the lock removals of the last 90 days',
        'A name outside the catalog answers `tracked: false`.',
        'the same API as tools for AI assistants',
        'the .ai estimate of a name',
        'Runs no live check.',
        'Some lists are also public datasets on GitHub.',
    ];

    it('catches every banned phrase and lets the kept ones pass', () => {
        for (const line of banned) assert.notDeepEqual(brokenBy(line), [], line);
        for (const line of kept) assert.deepEqual(brokenBy(line), [], line);
    });

    it('joins a wrapped docstring into one text', () => {
        assert.deepEqual(brokenBy(joinedText([' * The answer, as', ' * of the day.'])), ['when our data was read']);
    });

    it('reads the texts a reader sees, not the tests and the scripts', () => {
        for (const path of ['README.md', 'packages/whois/README.md', 'packages/whois/package.json', 'packages/whois/src/bin.ts', 'examples/google-sheets/Code.gs', '.zenodo.json']) assert.ok(isReaderFile(path), path);
        assert.ok(isReaderFile('scripts/lib/codegen.mjs'), 'codegen writes the SDK docstrings');
        for (const path of ['test/examples.test.mjs', 'packages/whois/test/whois.test.mjs', 'packages/sdk/typetests/answers.ts', 'scripts/check-text.mjs']) assert.ok(!isReaderFile(path), path);
    });

    it('fails on a README that says "stored" again, and passes the same words in a test (mutation check)', () => {
        const root = mkdtempSync(join(tmpdir(), 'check-text-'));
        try {
            mkdirSync(join(root, 'test'));
            writeFileSync(join(root, 'test', 'a.test.mjs'), "it('reads the stored answer', () => {});\n");
            writeFileSync(join(root, 'README.md'), 'The answer is the record in the catalog.\n');
            assert.equal(spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' }).status, 0);
            writeFileSync(join(root, 'README.md'), 'The answer is the latest record stored in the catalog.\n');
            const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' });
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /README\.md:1: "stored"/);
            // A real line this lane removed, put back in a copy of the real README.
            const real = readFileSync(join(ROOT, 'packages', 'registrar-prices', 'README.md'), 'utf8').replace('a year after that.', 'a year after that (2026-11-11).');
            writeFileSync(join(root, 'README.md'), real);
            const dated = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' });
            assert.notEqual(dated.status, 0);
            assert.match(dated.stderr, /README\.md:3: a dated example answer/);
            // A phrase a docstring wrap splits.
            writeFileSync(join(root, 'README.md'), 'The answer, as\nof its day.\n');
            const wrapped = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' });
            assert.notEqual(wrapped.status, 0);
            assert.match(wrapped.stderr, /across a line wrap/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
