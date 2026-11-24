#!/usr/bin/env node
/*----------------------------------
- SMOKE: THE BUILT PACKAGES AGAINST THE LIVE FREE API
----------------------------------*/

/**
 * Runs the built `ud` bin as a user would, keyless, against the public host: `get-name harbor.io` and
 * `list-tlds --limit 3 --json`. Then packs the built packages (no rebuild), installs the tarballs into an empty folder
 * and runs each use-case package through `npx` under its name on npm, one keyless call each, as its README's first
 * block shows it: `npx domain-availability get.plumbing`, `npx domain-appraisal get.plumbing`, `npx registrar-prices
 * io`, `npx @uniquedomains/whois get.plumbing`. Six keyless calls; run by the nightly contract workflow after the
 * build, never by `npm test`, so the tests stay offline.
 */

import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { manifestOf, packageFolders } from './lib/packages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'packages', 'cli', 'dist', 'bin.js');
const exec = promisify(execFile);
// A member or RapidAPI key in the runner's environment would change what the free path answers.
const env = { ...process.env, UD_API_KEY: '', UD_RAPIDAPI_KEY: '' };
/** Each use-case package's folder and the argument of its README's `npx` line. */
const USE_CASES = [
    { folder: 'domain-availability', arg: 'get.plumbing' },
    { folder: 'domain-appraisal', arg: 'get.plumbing' },
    { folder: 'registrar-prices', arg: 'io' },
    { folder: 'whois', arg: 'get.plumbing' },
];

const ud = async (...args) => {
    const { stdout } = await exec(process.execPath, [BIN, ...args], { env });
    return JSON.parse(stdout);
};

const name = await ud('get-name', 'harbor.io');
if (name.data?.name !== 'harbor.io') throw new Error(`get-name harbor.io answered ${JSON.stringify(name).slice(0, 200)}`);
console.log(`get-name harbor.io: ${name.data.status}`);

const tlds = await ud('list-tlds', '--limit', '3', '--json');
if (!Array.isArray(tlds.data) || tlds.data.length !== 3) throw new Error(`list-tlds --limit 3 answered ${JSON.stringify(tlds).slice(0, 200)}`);
console.log(`list-tlds --limit 3: ${tlds.data.map((row) => row.tld).join(', ')}`);

const work = mkdtempSync(join(tmpdir(), 'ud-smoke-'));
try {
    const tarballs = join(work, 'tarballs');
    const project = join(work, 'project');
    mkdirSync(tarballs);
    mkdirSync(project);
    // `--ignore-scripts`: the packages are built already, so `prepack` does not build them again.
    execFileSync('npm', ['pack', '--ignore-scripts', ...packageFolders().flatMap((folder) => ['--workspace', `packages/${folder}`]), '--pack-destination', tarballs], { cwd: ROOT, stdio: 'ignore' });
    writeFileSync(join(project, 'package.json'), '{ "name": "ud-smoke", "private": true }\n');
    const files = readdirSync(tarballs).map((file) => join(tarballs, file));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...files], { cwd: project, stdio: 'ignore' });
    for (const { folder, arg } of USE_CASES) {
        const specifier = manifestOf(folder).name;
        const { stdout } = await exec('npx', ['--offline', '--no', specifier, arg], { cwd: project, env });
        const answer = JSON.parse(stdout);
        if (answer === null || typeof answer !== 'object') throw new Error(`npx ${specifier} ${arg} answered ${stdout.slice(0, 200)}`);
        console.log(`npx ${specifier} ${arg}: ${Array.isArray(answer) ? `${answer.length} rows` : (answer.status ?? answer.registrar?.name ?? (answer.count === undefined ? 'an answer' : `${answer.count} sales`))}`);
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
