#!/usr/bin/env node
/*----------------------------------
- README EXAMPLES
----------------------------------*/

/**
 * Writes `test/readme/<readme>.generated.mjs` from every README's examples (see `scripts/lib/readme.mjs`), so
 * `npm test` runs them against the fixture server (`test/readme.test.mjs`). With `--live`, also runs the examples
 * not marked `fixture` against the live free tier, keyless: the nightly contract job's check that the READMEs still
 * work. A `rate_limited` answer there stops the run with a warning, not a failure: the runner's address is shared,
 * and a spent window says nothing about the README.
 *
 * Usage: node scripts/readme-examples.mjs           (write the generated files)
 *        node scripts/readme-examples.mjs --live    (write them, then run them against the live API)
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findReadmes, renderModule, runExample } from './lib/readme.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'readme');
/** The module a README's `from '@uniquedomains/<package>'` becomes; null for a package that has none (the CLI). */
const specifierOf = (name) => (existsSync(join(ROOT, 'test', 'support', `readme-${name}.mjs`)) ? `../support/readme-${name}.mjs` : null);

/** Writes one module per README and removes those of READMEs that are gone. Answers what it wrote. */
export const writeGenerated = () => {
    mkdirSync(OUT, { recursive: true });
    const readmes = findReadmes(ROOT).map((readme) => ({ ...readme, module: join(OUT, `${readme.slug}.generated.mjs`) }));
    for (const file of readdirSync(OUT).filter((name) => name.endsWith('.generated.mjs'))) {
        if (!readmes.some((readme) => readme.module === join(OUT, file))) rmSync(join(OUT, file));
    }
    for (const readme of readmes) writeFileSync(readme.module, renderModule(readme.examples, specifierOf, relative(ROOT, readme.file)));
    return readmes;
};

const runLive = async (readmes) => {
    delete process.env.UD_API_KEY;
    // Imported here: writing the generated files needs no build.
    const { useTarget } = await import(pathToFileURL(join(ROOT, 'test', 'support', 'readme-sdk.mjs')).href);
    useTarget(null);
    let ran = 0;
    for (const readme of readmes) {
        const { examples } = await import(pathToFileURL(readme.module).href);
        for (const example of examples.filter((entry) => entry.mode === 'run')) {
            try {
                await runExample(example);
                ran++;
                console.log(`ok ${relative(ROOT, readme.file)} ${example.name}`);
            } catch (error) {
                if (error?.code === 'rate_limited') {
                    const message = `The keyless window is spent (${error.detail}); ${ran} examples ran, the rest wait for the next run.`;
                    // An annotation on the run's page, so nights that ran nothing do not pass unseen.
                    console.warn(process.env.GITHUB_ACTIONS ? `::warning title=README examples::${message}` : message);
                    return;
                }
                throw new Error(`${relative(ROOT, readme.file)} ${example.name}: ${error.message}`, { cause: error });
            }
        }
    }
    console.log(`${ran} README examples ran against the live API.`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const readmes = writeGenerated();
    const counts = readmes.map((readme) => `${relative(ROOT, readme.file)} ${readme.examples.length}`).join(', ');
    console.log(`Wrote the README examples (${counts}).`);
    if (process.argv.includes('--live')) {
        await runLive(readmes).catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
    }
}
