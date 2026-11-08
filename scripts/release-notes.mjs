#!/usr/bin/env node
/*----------------------------------
- RELEASE NOTES FROM CONVENTIONAL COMMITS
----------------------------------*/

/**
 * Prints the changelog section of a tag: the commits since the previous `v*` tag, grouped by conventional type.
 * Also checks that the tag matches both packages' versions, which move together (the CLI pins the same SDK version),
 * and fails when they differ so a mistyped tag never publishes.
 *
 * Usage: node scripts/release-notes.mjs v0.1.0 > notes.md
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag)) throw new Error('Usage: release-notes.mjs v<major>.<minor>.<patch>');

const versionOf = (name) => JSON.parse(readFileSync(join(ROOT, 'packages', name, 'package.json'), 'utf8')).version;
const version = tag.slice(1);
for (const name of ['sdk', 'cli']) if (versionOf(name) !== version) throw new Error(`packages/${name} is ${versionOf(name)}, the tag says ${version}`);
const cli = JSON.parse(readFileSync(join(ROOT, 'packages', 'cli', 'package.json'), 'utf8'));
if (cli.dependencies['@uniquedomains/sdk'] !== version) throw new Error(`the CLI depends on @uniquedomains/sdk ${cli.dependencies['@uniquedomains/sdk']}, not ${version}`);

// stderr is dropped: on the first tag `git describe` finds no previous tag, which is expected, not an error to show.
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const previous = (() => {
    try {
        return git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`);
    } catch {
        return null;
    }
})();
const range = previous ? `${previous}..${tag}` : tag;
const subjects = git('log', '--format=%s', range).split('\n').filter(Boolean);

const GROUPS = [['feat', 'Added'], ['fix', 'Fixed'], ['perf', 'Faster'], ['docs', 'Docs'], ['openapi', 'API document']];
const lines = [`## ${version}`, ''];
const used = new Set();
for (const [type, title] of GROUPS) {
    const entries = subjects.filter((subject) => new RegExp(`^${type}(\\(.+\\))?!?:`).test(subject));
    if (entries.length === 0) continue;
    entries.forEach((entry) => used.add(entry));
    lines.push(`### ${title}`, '', ...entries.map((entry) => `- ${entry.replace(/^\w+(\(.+\))?!?:\s*/, '')}`), '');
}
const other = subjects.filter((subject) => !used.has(subject) && !/^(chore|ci|test|build|style|refactor)(\(.+\))?!?:/.test(subject));
if (other.length > 0) lines.push('### Other', '', ...other.map((entry) => `- ${entry}`), '');
if (previous) lines.push(`Changes since ${previous}.`);
console.log(lines.join('\n'));
