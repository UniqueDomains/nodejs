import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { folderOfPackage, manifestOf, packageFolders, PLACEHOLDER_VERSION, placeholderManifest, workspacePackages } from '../lib/packages.mjs';
import { brokenBy, brokenRules, isReaderFile, joinedText, READER_RULES } from '../lib/text-rules.mjs';

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
    // The removed lines of this lane: each still fails the guard.
    const removed = [
        'The stored answer for one domain name.',
        'The answer comes from storage.',
        'refreshed by the same scanner',
        'Free, read from storage, never live.',
        'A stored record, not a live lookup.',
        'An answer carries its day where the record has one.',
        'nameservers as clean JSON, with the day of the record.',
        'The latest record stored in the Unique.domains catalog, not a query sent to the registry at that moment.',
        'When the registry did not conclude, the API answers 202.',
        'Reads the name from its registry and a registrar now.',
        'That answer (2026-11-11, trimmed) comes from a record.',
        '## A fresh appraisal',
        'when its estimate is missing or out of date',
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
        'Keep your key in an environment variable.',
        'a check could not run just now',
        'The registrar of the record.',
    ];

    // Samples per rule id, kept here and not beside the rule, so deleting a rule, or one alternative inside it,
    // leaves a sample uncaught (review of lane N, M1; the planner's point 5).
    const SAMPLES = {
        'stored': ['The stored answer.', 'We store it.', 'It stores the reading.', 'Storing the reading.', 'It comes from storage.'],
        'scan': ['A daily scan.', 'It scans every ending.', 'The scanner.', 'Two scanners.', 'Scanned today.', 'Scanning now.', 'Rescanned on a rolling schedule.'],
        'sync': ['Kept in sync every night.', 'Synced daily.'],
        'not-live': ['This answer is not live.', 'Not a live answer.'],
        'never-live': ['Free, never live.'],
        'live-read': ['A live read.', 'Live reads come back at 00:00 UTC.', 'A live reading.', 'Live readings.', 'A live lookup.', 'Live lookups.'],
        'reads-live': ['Read the name live.', 'It reads live.'],
        'live-from': ['Prices live from the shop.'],
        'live-registry-check': ['A live registry check needs a key.'],
        'from-registry': ['The answer comes from the registry.', 'Read from its registry.'],
        'registry-word': ['The registry\'s word right now.', 'The registry\u2019s word right now.'],
        'to-registry': ['Not a query sent to the registry.', 'We asked the registry.'],
        'registry-asked': ['When the registry did not conclude.', 'Even when the registry was asked.'],
        'as-of': ['Prices as of Monday.'],
        'carries-its-day': ['An answer carries its day.'],
        'day-it-is-from': ['Say the day it is from.'],
        'latest-day': ['The totals of the latest day.', 'Names on the latest footprint day.'],
        'latest-record': ['The latest record of a name.', 'The latest records.', 'The latest registry record.', 'The latest DNS reading.', 'The latest readings.', 'The latest answer.', 'The latest answers.', 'The latest status.'],
        'how-current': ['How current is the data?', 'How fresh is the data?'],
        'checked-on': ['Checked just now.', 'Terms checked on Monday.'],
        'checked-date': ['Terms checked 3 Oct.'],
        'out-of-date': ['An estimate out of date.'],
        'its-dates': ['505 endings, each with its dates.'],
        'with-its-day': ['Nameservers, with the day of the record.', 'Each answer, with its day.'],
        'dated-by-day': ['Answers are dated by day.'],
        'fresh': ['A fresh estimate.', 'No fresh estimates.', 'A fresh appraisal.', 'Fresh appraisals.', 'A fresh read.', 'Fresh reads.', 'A fresh reading.', 'Fresh readings.', 'A fresh record.', 'Fresh records.', 'A fresh answer.', 'Fresh answers.', 'Fresh data.', 'A fresh status.', 'Fresh statuses.', 'A fresh figure.', 'Fresh figures.'],
        'dated-example': ['A median of $2,677 (2026-11-11).', 'That answer (2026-11-11, trimmed).'],
        'answered-on': ['Is get.plumbing taken? Answered on 2026-11-11.'],
        'body-publishes': ['The round as ICANN publishes it.', 'The list as IANA publishes it.', 'The registrar as IANA names it.'],
        'ai-made': ['An AI editor.', 'An AI-estimate.', 'An AI estimate.', 'An AI appraisal.', 'An AI valuation.', 'An AI-written summary.', 'An AI-generated idea.', 'An AI summary.', 'An AI model values it.'],
        'made-by-ai': ['Written by AI.', 'Generated by a model.', 'Made by an AI.', 'Drafted by Claude.', 'Created by an LLM.'],
        'claude-models': ['Claude models wrote the story.', 'A Claude model wrote it.'],
    };

    it('has one sample per rule that this rule alone catches, so a deleted or broken rule fails here (review of lane N, M1)', () => {
        assert.equal(new Set(READER_RULES.map(({ id }) => id)).size, READER_RULES.length);
        assert.deepEqual(READER_RULES.map(({ id }) => id).sort(), Object.keys(SAMPLES).sort());
        for (const [id, samples] of Object.entries(SAMPLES)) {
            for (const sample of samples) {
                assert.deepEqual(brokenRules(sample), [id], `${id}: "${sample}"`);
                assert.deepEqual(brokenRules(sample, READER_RULES.filter((rule) => rule.id !== id)), [], `${id} is the only rule for "${sample}"`);
            }
        }
    });

    it('catches every line this lane removed and lets the kept ones pass', () => {
        for (const line of removed) assert.notDeepEqual(brokenBy(line), [], line);
        for (const line of kept) assert.deepEqual(brokenBy(line), [], line);
    });

    it('joins a wrapped docstring, a quote and CRLF lines into one text', () => {
        assert.deepEqual(brokenRules(joinedText([' * The answer, as', ' * of the day.'])), ['as-of']);
        assert.deepEqual(brokenRules(joinedText(['> The answer, as\r', '> of the day.'])), ['as-of']);
    });

    it('reads the texts a reader sees, not the tests and the scripts', () => {
        for (const path of ['README.md', 'packages/whois/README.md', 'packages/whois/package.json', 'packages/whois/src/bin.ts', 'examples/google-sheets/Code.gs', '.zenodo.json']) assert.ok(isReaderFile(path), path);
        assert.ok(isReaderFile('scripts/lib/codegen.mjs'), 'codegen writes the SDK docstrings');
        assert.ok(isReaderFile('scripts/lib/packages.mjs'), 'packages writes a placeholder description and README');
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
            // A hand-written file is read whatever its name (review of lane N, m3).
            writeFileSync(join(root, 'README.md'), 'The answer.\n');
            writeFileSync(join(root, 'openapi-notes.md'), 'The stored answer.\n');
            mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
            writeFileSync(join(root, 'docs', 'generated', 'openapi.json'), '{ "note": "The stored answer." }\n');
            const named = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-text.mjs'), root], { encoding: 'utf8' });
            assert.notEqual(named.status, 0);
            assert.match(named.stderr, /openapi-notes\.md:1/);
            assert.match(named.stderr, /docs\/generated\/openapi\.json:1/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

/*----------------------------------
- THE NAMES ON NPM SINCE 0.3.0 (npm unscoped names, lane R)
----------------------------------*/

const NAMES = {
    sdk: 'domain-name-api',
    cli: '@uniquedomains/cli',
    whois: '@uniquedomains/whois',
    'domain-availability': 'domain-availability',
    'registrar-prices': 'registrar-prices',
    'domain-appraisal': 'domain-appraisal',
};

describe('scripts/lib/packages.mjs: each package by its name on npm', () => {
    it('reads each name from the package.json, never from the folder', () => {
        assert.deepEqual(Object.fromEntries(workspacePackages().map(({ folder, name }) => [folder, name])), NAMES);
        assert.equal(workspacePackages()[0].folder, 'sdk');
    });

    it('finds the folder of a name, and none for a name the packages had before 0.3.0', () => {
        for (const [folder, name] of Object.entries(NAMES)) assert.equal(folderOfPackage(name), folder, name);
        for (const old of ['@uniquedomains/sdk', '@uniquedomains/domain-availability', '@uniquedomains/registrar-prices', '@uniquedomains/domain-appraisal', 'sdk']) assert.equal(folderOfPackage(old), null, old);
    });

    it('a placeholder takes the package\'s name on npm', () => {
        assert.equal(placeholderManifest(manifestOf('sdk')).name, 'domain-name-api');
    });
});

describe('one version for every workspace, the SDK pinned by its name on npm', () => {
    it('every package is at the SDK\'s version, and each other one depends on the SDK at exactly that version', () => {
        const sdk = manifestOf('sdk');
        for (const folder of packageFolders()) {
            const manifest = manifestOf(folder);
            assert.equal(manifest.version, sdk.version, folder);
            if (folder === 'sdk') continue;
            assert.equal(manifest.dependencies?.[sdk.name], sdk.version, `${folder} depends on ${sdk.name}`);
            assert.equal(manifest.dependencies?.['@uniquedomains/sdk'], undefined, `${folder} still names the SDK's former name`);
        }
    });

    it('release-notes.mjs refuses a package whose dependency names the SDK by another name, naming the SDK as npm does', () => {
        // A copy of the manifests and the scripts, so the tree is not touched: the CLI depends on the SDK's former name.
        const copy = mkdtempSync(join(tmpdir(), 'ud-release-notes-'));
        try {
            mkdirSync(join(copy, 'scripts', 'lib'), { recursive: true });
            for (const file of ['scripts/release-notes.mjs', 'scripts/lib/packages.mjs', 'package.json']) writeFileSync(join(copy, file), readFileSync(join(ROOT, file)));
            for (const folder of packageFolders()) {
                mkdirSync(join(copy, 'packages', folder), { recursive: true });
                const manifest = manifestOf(folder);
                if (folder === 'cli') manifest.dependencies = { '@uniquedomains/sdk': manifest.version };
                writeFileSync(join(copy, 'packages', folder, 'package.json'), JSON.stringify(manifest));
            }
            const result = spawnSync(process.execPath, [join(copy, 'scripts', 'release-notes.mjs'), `v${manifestOf('sdk').version}`], { encoding: 'utf8' });
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /packages\/cli depends on domain-name-api undefined/);
        } finally {
            rmSync(copy, { recursive: true, force: true });
        }
    });
});

describe('scripts/list-packages.mjs --with-names', () => {
    it('prints each folder and its name on npm, the SDK first', () => {
        const lines = execFileSync(process.execPath, [join(ROOT, 'scripts', 'list-packages.mjs'), '--with-names'], { encoding: 'utf8' }).trim().split('\n');
        assert.equal(lines[0], 'sdk domain-name-api');
        assert.deepEqual(Object.fromEntries(lines.map((line) => line.split(' '))), NAMES);
    });

    it('refuses an unknown option', () => {
        const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'list-packages.mjs'), '--names'], { encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Unknown option --names/);
    });
});

describe('the release\'s publish step, run with a stand-in npm', () => {
    // The step's script as release.yml holds it, run by bash with an `npm` that logs its calls: what npm "serves"
    // already is a list of names, and `npm publish` reads its standard input, as a prompt would.
    const release = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
    const step = /- name: Publish domain-name-api, then every other package\n {8}run: \|\n((?: {10}.*\n|\n)+)/.exec(release);

    const runStep = (served) => {
        assert.ok(step, 'the publish step');
        const work = mkdtempSync(join(tmpdir(), 'ud-release-step-'));
        try {
            const bin = join(work, 'bin');
            mkdirSync(bin);
            writeFileSync(join(bin, 'npm'), [
                '#!/usr/bin/env bash',
                `echo "npm $*" >> "${join(work, 'calls.log')}"`,
                'if [ "$1" = view ]; then',
                `  grep -qxF "$2" "${join(work, 'served')}" && exit 0`,
                '  exit 1',
                'fi',
                'if [ "$1" = publish ]; then cat >/dev/null; fi',
                'exit 0',
                '',
            ].join('\n'), { mode: 0o755 });
            writeFileSync(join(work, 'served'), served.map((name) => `${name}@9.9.9`).join('\n') + '\n');
            const script = step[1].split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
            const result = spawnSync('bash', ['-e', '-c', script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REF_NAME: 'v9.9.9' } });
            assert.equal(result.status, 0, result.stderr);
            return { calls: readFileSync(join(work, 'calls.log'), 'utf8').trim().split('\n'), stdout: result.stdout };
        } finally {
            rmSync(work, { recursive: true, force: true });
        }
    };

    it('reads each package by its name on npm and publishes it by its folder, the SDK first', () => {
        const { calls } = runStep([]);
        const views = calls.filter((call) => call.startsWith('npm view')).map((call) => call.split(' ')[2]);
        assert.deepEqual(views, Object.values(NAMES).map((name) => `${name}@9.9.9`));
        const published = calls.filter((call) => call.startsWith('npm publish')).map((call) => /--workspace packages\/(\S+)/.exec(call)[1]);
        assert.deepEqual(published, Object.keys(NAMES));
    });

    it('a second run, after a cut one, skips what npm serves under each real name', () => {
        const { calls, stdout } = runStep(['domain-name-api', '@uniquedomains/cli', 'domain-availability']);
        const published = calls.filter((call) => call.startsWith('npm publish')).map((call) => /--workspace packages\/(\S+)/.exec(call)[1]);
        assert.deepEqual(published, ['whois', 'registrar-prices', 'domain-appraisal']);
        assert.match(stdout, /domain-name-api@9\.9\.9 is already published\./);
    });
});
