#!/usr/bin/env node
/*----------------------------------
- PUBLISH A PLACEHOLDER OF EACH NEW PACKAGE
----------------------------------*/

/**
 * npm sets up trusted publishing only for a package that already exists. So a new package first gets a placeholder
 * `0.0.1`, by hand, which names the package and holds no code; the tag then publishes its real version with provenance,
 * in the release's order, the SDK first. Publishing the real version by hand instead would leave it without provenance,
 * and unable to install until the SDK's version is out (Gaetan's 1A of 2026-11-09).
 *
 * Reads the registry for each workspace and publishes only the packages it does not know, so a second run does nothing.
 * Publishing needs `npm login` and asks for the account's second factor.
 *
 * Usage: node scripts/publish-placeholder.mjs --dry-run
 *        node scripts/publish-placeholder.mjs
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestOf, packageFolders, placeholderManifest, placeholderReadme } from './lib/packages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
if (unknown.length > 0) throw new Error(`Unknown option ${unknown.join(' ')}. Usage: publish-placeholder.mjs [--dry-run]`);

/** Whether the registry has never heard of the package. Anything but a clear 404 stops the run: never publish on a guess. */
const isNew = (name) => {
    const result = spawnSync('npm', ['view', name, 'version'], { encoding: 'utf8' });
    if (result.status === 0) return false;
    if (/\bE404\b/.test(result.stderr)) return true;
    throw new Error(`npm view ${name} failed:\n${result.stderr}`);
};

for (const folder of packageFolders()) {
    const manifest = manifestOf(folder);
    if (!isNew(manifest.name)) {
        console.log(`${manifest.name} is already on the registry: left alone.`);
        continue;
    }
    const work = mkdtempSync(join(tmpdir(), 'ud-placeholder-'));
    try {
        writeFileSync(join(work, 'package.json'), `${JSON.stringify(placeholderManifest(manifest), null, 2)}\n`);
        writeFileSync(join(work, 'README.md'), placeholderReadme(manifest));
        copyFileSync(join(ROOT, 'LICENSE'), join(work, 'LICENSE'));
        const published = spawnSync('npm', ['publish', work, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])], { stdio: 'inherit' });
        if (published.status !== 0) throw new Error(`npm publish of ${manifest.name} failed.`);
        console.log(`${manifest.name}@${placeholderManifest(manifest).version} ${dryRun ? 'would be published' : 'is published'}.`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}
