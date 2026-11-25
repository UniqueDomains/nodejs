#!/usr/bin/env node
/*----------------------------------
- SMOKE: THE BUILT PACKAGES AGAINST THE LIVE FREE API
----------------------------------*/

/**
 * Runs the built `ud` bin as a user would, keyless, against the public host: `get-name harbor.io` and
 * `list-tlds --limit 3 --json`. Then packs the built packages (no rebuild), installs the tarballs into an empty folder
 * and runs five of the seven use-case packages through `npx` under their names on npm, one keyless call each, as its README's first
 * block shows it: `npx domain-availability get.plumbing`, `npx domain-appraisal get.plumbing`, `npx registrar-prices
 * io`, `npx @uniquedomains/whois get.plumbing`, `npx domain-sales .com`. Seven keyless calls; run by the nightly
 * contract workflow after the build, never by `npm test`, so the tests stay offline. `expired-domains-api` and
 * `domain-auctions` run through `npx` in `check-pack.mjs`, against the fixture server, to keep the nightly under its
 * hourly window of 60 calls.
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
    // One line for the packages of lane N, within the keyless hourly window: the first README example of
    // expired-domains-api and domain-auctions already makes their command's call live every night, and both bins run
    // through npx on the packed tarballs in `check-pack.mjs`.
    { folder: 'domain-sales', arg: '.com' },
];

/** One line on a use-case package's answer: what its README's first block shows. */
const summaryOf = (folder, answer) => {
    if (Array.isArray(answer)) return `${answer.length} rows`;
    if (folder === 'domain-sales') return `${answer.count12m} sales in 12 months`;
    if (folder === 'domain-appraisal') return `${answer.count} sales`;
    return answer.status ?? answer.registrar?.name ?? 'an answer';
};

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
        let stdout;
        try {
            ({ stdout } = await exec('npx', ['--offline', '--no', specifier, ...(arg === null ? [] : [arg])], { cwd: project, env }));
        } catch (error) {
            // A spent keyless window on the runner's shared address says nothing about the package: a warning, as the
            // README examples give, and the rest wait for the next night. Any other failure fails the smoke.
            if (!/Try again in \d+ seconds/.test(error.stderr ?? '')) throw error;
            const message = `The keyless window is spent at npx ${specifier}; the use-case packages left wait for the next run.`;
            console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Smoke::${message}` : message);
            break;
        }
        const answer = JSON.parse(stdout);
        const line = `npx ${specifier}${arg === null ? '' : ` ${arg}`}`;
        if (answer === null || typeof answer !== 'object') throw new Error(`${line} answered ${stdout.slice(0, 200)}`);
        console.log(`${line}: ${summaryOf(folder, answer)}`);
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
