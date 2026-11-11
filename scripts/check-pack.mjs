#!/usr/bin/env node
/*----------------------------------
- CHECK PACK: THE TARBALLS AS A USER INSTALLS THEM
----------------------------------*/

/**
 * Packs every package, installs the tarballs into an empty project in a temporary folder, then requires and imports
 * the SDK, runs the SDK README's first example against the local fixture server, requires the CLI, and runs its bins
 * with `--version` and `--help`. Each use-case package is loaded in both module formats, its first function runs
 * against the fixture server, and its bin runs too, by its bin name and through `npx`. Fails on a tarball without its
 * code (review R1-1: a pack from an unbuilt tree shipped two files), without its namespaced methods or without its
 * bins. Offline: no API call.
 *
 * Usage: npm run check:pack   (packs the tree as it is: `prepack` builds it first)
 */

import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageFolders } from './lib/packages.mjs';
import { loadRecorded, startFixtureServer } from '../test/support/fixture-server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USE_CASES = [
    { name: 'whois', bin: 'ud-whois', call: 'whois', fn: ['whois', 'dns', 'whoisHistory'], arg: 'get.plumbing', read: 'registrar.name' },
    { name: 'domain-availability', bin: 'ud-availability', call: 'availability', fn: ['availability', 'check', 'availabilityBatch'], arg: 'get.plumbing', read: 'status' },
    { name: 'registrar-prices', bin: 'ud-prices', call: 'pricesForTld', fn: ['pricesForTld', 'renewalTraps', 'priceChanges', 'cheapest', 'priceHistory'], arg: 'io', read: 'length' },
    { name: 'domain-appraisal', bin: 'ud-appraise', call: 'comparableSales', fn: ['comparableSales', 'appraisal', 'appraise'], arg: 'get.plumbing', read: 'count' },
];
const work = mkdtempSync(join(tmpdir(), 'ud-pack-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
// The fixture server runs in this process, so a child that calls it must not block the event loop.
const runAsync = (command, args, cwd) => new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)));
});

try {
    const tarballs = join(work, 'tarballs');
    const project = join(work, 'project');
    run('mkdir', ['-p', tarballs], ROOT);
    const folders = packageFolders();
    run('npm', ['pack', ...folders.flatMap((folder) => ['--workspace', `packages/${folder}`]), '--pack-destination', tarballs], ROOT);
    const files = readdirSync(tarballs).filter((file) => file.endsWith('.tgz')).map((file) => join(tarballs, file));
    if (files.length !== folders.length) throw new Error(`expected ${folders.length} tarballs, found ${files.length}`);

    run('mkdir', ['-p', project], ROOT);
    writeFileSync(join(project, 'package.json'), '{ "name": "ud-pack-check", "private": true }\n');
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...files], project);

    run(process.execPath, ['-e', 'const s = require("@uniquedomains/sdk"); const ud = s.createClient({ apiKey: null }); if (typeof ud.request !== "function" || typeof ud.names.get !== "function" || !(new s.RateLimitError({ code: "rate_limited", detail: "x", status: 429, title: "x", type: "x", instance: "/" }, {}) instanceof s.ApiProblemError)) process.exit(1);'], project);
    run(process.execPath, ['--input-type=module', '-e', 'import { createClient, OPERATIONS, NAMESPACE_METHODS } from "@uniquedomains/sdk"; if (!createClient || !OPERATIONS.get_name || NAMESPACE_METHODS.names.get !== "get_name") process.exit(1);'], project);

    // The README's first example, as a user runs it after `npm install`, against the fixture server.
    const server = await startFixtureServer();
    try {
        const firstExample = 'import { createClient } from "@uniquedomains/sdk"; const ud = createClient({ apiKey: null, baseUrl: process.argv[1] }); const name = await ud.names.get("get.plumbing"); console.log(name.status);';
        const printed = await runAsync(process.execPath, ['--input-type=module', '-e', firstExample, server.base], project);
        const status = loadRecorded().find((fixture) => fixture.name === 'usecase-availability').response.body.data.status;
        if (printed.trim() !== status) throw new Error(`the README's first example printed "${printed.trim()}", not "${status}"`);

        for (const useCase of USE_CASES) {
            const specifier = `@uniquedomains/${useCase.name}`;
            const names = JSON.stringify(useCase.fn);
            run(process.execPath, ['-e', `const p = require("${specifier}"); if (!${names}.every((name) => typeof p[name] === "function") || typeof p.PlanRequiredError !== "function") process.exit(1);`], project);
            const script = `import { ${useCase.call}, PlanRequiredError } from "${specifier}"; import { PlanRequiredError as FromSdk } from "@uniquedomains/sdk"; if (PlanRequiredError !== FromSdk) process.exit(3); const answer = await ${useCase.call}(process.argv[1], { apiKey: null, baseUrl: process.argv[2] }); console.log(${useCase.read.split('.').reduce((path, key) => `${path}?.${key}`, 'answer')});`;
            const answer = (await runAsync(process.execPath, ['--input-type=module', '-e', script, useCase.arg, server.base], project)).trim();
            if (!answer || answer === 'undefined') throw new Error(`${specifier} printed "${answer}"`);

            const binPath = join(project, 'node_modules', '.bin', useCase.bin);
            if (!/^\d+\.\d+\.\d+$/.test(run(binPath, ['--version'], project).trim())) throw new Error(`${useCase.bin} --version`);
            if (!run(binPath, ['--help'], project).includes(`${useCase.bin} <`)) throw new Error(`${useCase.bin} --help shows no usage`);
            JSON.parse(await runAsync(binPath, [useCase.arg, '--base', server.base], project));
            // What the plan's first line promises: `npx @uniquedomains/<package> ...` finds the one bin. Offline here.
            const viaNpx = await runAsync('npx', ['--offline', '--no', specifier, useCase.arg, '--base', server.base], project);
            if (!viaNpx.trim()) throw new Error(`npx ${specifier} printed nothing`);
        }
    } finally {
        await server.close();
    }
    run(process.execPath, ['-e', 'const c = require("@uniquedomains/cli"); if (typeof c.run !== "function") process.exit(1);'], project);
    for (const bin of ['ud', 'uniquedomains']) {
        const version = run(join(project, 'node_modules', '.bin', bin), ['--version'], project).trim();
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${bin} --version printed "${version}"`);
        if (!run(join(project, 'node_modules', '.bin', bin), ['--help'], project).includes('get-name <name>')) throw new Error(`${bin} --help lists no get-name`);
    }
    console.log(`The packed packages install and load (${files.map((file) => file.split('/').pop()).join(', ')}).`);
} finally {
    rmSync(work, { recursive: true, force: true });
}
