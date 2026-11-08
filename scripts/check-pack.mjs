#!/usr/bin/env node
/*----------------------------------
- CHECK PACK: THE TARBALLS AS A USER INSTALLS THEM
----------------------------------*/

/**
 * Packs both packages, installs the two tarballs into an empty project in a temporary folder, then requires and
 * imports the SDK, requires the CLI, and runs both bins with `--version` and `--help`. Fails on a tarball without its
 * code (review R1-1: a pack from an unbuilt tree shipped two files) or without its bins. Offline: no API call.
 *
 * Usage: npm run check:pack   (packs the tree as it is: `prepack` builds it first)
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'ud-pack-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
    const tarballs = join(work, 'tarballs');
    const project = join(work, 'project');
    run('mkdir', ['-p', tarballs], ROOT);
    run('npm', ['pack', '--workspace', 'packages/sdk', '--workspace', 'packages/cli', '--pack-destination', tarballs], ROOT);
    const files = readdirSync(tarballs).filter((file) => file.endsWith('.tgz')).map((file) => join(tarballs, file));
    if (files.length !== 2) throw new Error(`expected two tarballs, found ${files.length}`);

    run('mkdir', ['-p', project], ROOT);
    writeFileSync(join(project, 'package.json'), '{ "name": "ud-pack-check", "private": true }\n');
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...files], project);

    run(process.execPath, ['-e', 'const s = require("@uniquedomains/sdk"); if (typeof s.createClient({ apiKey: null }).request !== "function") process.exit(1);'], project);
    run(process.execPath, ['--input-type=module', '-e', 'import { createClient, OPERATIONS } from "@uniquedomains/sdk"; if (!createClient || !OPERATIONS.get_name) process.exit(1);'], project);
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
