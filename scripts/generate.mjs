#!/usr/bin/env node
/*----------------------------------
- GENERATE: THE SNAPSHOT AND THE SDK'S GENERATED FILES
----------------------------------*/

/**
 * Fetches the API's OpenAPI document and the sixteen RapidAPI listing documents, keeps them as the committed
 * snapshot under `openapi/`, and writes the SDK's generated files from that snapshot:
 *
 * - `packages/sdk/src/generated/schema.d.ts`: the document's types, from `openapi-typescript`;
 * - `packages/sdk/src/generated/operations.ts`: one entry per operation (id, method, path, tier, plan, metered,
 *   tag, summary, parameters in path order then query order, the body's flat properties);
 * - `packages/sdk/src/generated/listings.ts`: each listing's id, title, RapidAPI host and operation ids;
 * - `packages/sdk/src/generated/namespaces.ts`: the namespaced methods, from the operations and the naming rule.
 *
 * Modes:
 *   npm run generate                      fetch, write the snapshot, regenerate
 *   npm run generate -- --check           fetch and fail when the snapshot or a generated file differs
 *   npm run generate -- --offline         regenerate from the committed snapshot, no network
 *   npm run generate -- --offline --check fail when a generated file differs from what the snapshot gives
 *   --summary <file>                      also write the change summary as Markdown (the contract workflow's body)
 *   --base <url>                          the API base (default UD_API_BASE, else https://api.unique.domains/v1)
 *
 * The generated files are committed, so installing the packages never needs the network.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildListingsSource, buildNamespacesSource, buildOperations, buildOperationsSource, listingIdsOf, reduceListing } from './lib/codegen.mjs';
import { READ_PAUSE_MS, readInTurn, wait } from './lib/pace.mjs';
import { summarizeChanges } from './lib/summary.mjs';

/*----------------------------------
- CONSTANTS
----------------------------------*/

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_FILE = join(ROOT, 'openapi', 'v1.json');
const LISTINGS_DIR = join(ROOT, 'openapi', 'listings');
const GENERATED_DIR = join(ROOT, 'packages', 'sdk', 'src', 'generated');
const DEFAULT_BASE = 'https://api.unique.domains/v1';

/*----------------------------------
- HELPERS
----------------------------------*/

const parseArgs = (argv) => {
    const options = { check: false, offline: false, summary: null, base: process.env.UD_API_BASE || DEFAULT_BASE };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--check') options.check = true;
        else if (arg === '--offline') options.offline = true;
        else if (arg === '--summary') options.summary = argv[++index];
        else if (arg === '--base') options.base = argv[++index];
        else throw new Error(`Unknown option ${arg}`);
    }
    return options;
};

// One serialization for the snapshot, so a byte comparison means a content comparison: the server's key order,
// two spaces, a final newline. The server's own bytes are not kept because its JSON is minified (unreadable diffs).
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const readText = async (file) => {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
};

const fetchDocument = async (base, listing) => {
    const url = new URL(`${base.replace(/\/$/, '')}/meta/openapi.json`);
    if (listing) url.searchParams.set('listing', listing);
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'uniquedomains-nodejs-generate' } });
    if (!response.ok) {
        const retry = response.headers.get('retry-after');
        throw new Error(`GET ${url} answered ${response.status}${retry ? ` (retry after ${retry} s)` : ''}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
};

/** The whole document, then each listing's document reduced to what the SDK reads (`reduceListing`). */
const fetchSnapshot = async (base) => {
    const document = await fetchDocument(base, null);
    // In turn and paced on purpose: seventeen requests in a burst would meet the edge's limit on this path and gain
    // nothing for a job that runs once a night. About 19 seconds a run.
    await wait(READ_PAUSE_MS);
    const listings = await readInTurn(listingIdsOf(document), async (id) => reduceListing(id, await fetchDocument(base, id)));
    return { document, listings };
};

const readSnapshot = async () => {
    const document = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8'));
    const listings = [];
    for (const id of listingIdsOf(document)) listings.push(JSON.parse(await readFile(join(LISTINGS_DIR, `${id}.json`), 'utf8')));
    return { document, listings };
};

/** Every file the snapshot and the generator own, as path to expected content. */
const buildFiles = async ({ document, listings }) => {
    const { default: openapiTS, astToString } = await import('openapi-typescript');
    // openapi-typescript may annotate the object it reads: hand it a copy so the snapshot stays the server's.
    const schemaSource = astToString(await openapiTS(structuredClone(document)));
    const header = '// Generated by scripts/generate.mjs from openapi/v1.json. Do not edit by hand: run `npm run generate`.\n';
    const operations = buildOperations(document);
    const files = new Map();
    files.set(SNAPSHOT_FILE, serialize(document));
    for (const listing of listings) files.set(join(LISTINGS_DIR, `${listing.id}.json`), serialize(listing));
    files.set(join(GENERATED_DIR, 'schema.d.ts'), `${header}/* eslint-disable */\n\n${schemaSource}`);
    files.set(join(GENERATED_DIR, 'operations.ts'), `${header}\n${buildOperationsSource(document, operations)}`);
    files.set(join(GENERATED_DIR, 'listings.ts'), `${header}\n${buildListingsSource(listings)}`);
    files.set(join(GENERATED_DIR, 'namespaces.ts'), `${header}\n${buildNamespacesSource(document, operations)}`);
    return files;
};

/*----------------------------------
- MAIN
----------------------------------*/

const main = async () => {
    const options = parseArgs(process.argv.slice(2));
    const previous = await readSnapshot().catch(() => null);
    const next = options.offline ? previous : await fetchSnapshot(options.base);
    if (!next) throw new Error('No committed snapshot to generate from: run `npm run generate` once with the network.');

    const summary = summarizeChanges(previous, next);
    if (options.summary) await writeFile(options.summary, summary.markdown);

    const files = await buildFiles(next);
    const differing = [];
    for (const [file, content] of files) if ((await readText(file)) !== content) differing.push(file);
    // A listing file whose id left the document is stale: `--check` reports it and a write removes it.
    const stale = (await readdir(LISTINGS_DIR).catch(() => []))
        .map((name) => join(LISTINGS_DIR, name))
        .filter((file) => file.endsWith('.json') && !files.has(file));
    differing.push(...stale);

    if (options.check) {
        if (differing.length === 0) {
            console.log(options.offline ? 'The generated files match the snapshot.' : 'The snapshot matches the live document.');
            return;
        }
        console.error(`Out of date (${differing.length} files):\n${differing.map((file) => `  ${relative(ROOT, file)}`).join('\n')}`);
        console.error(summary.text);
        console.error('Run `npm run generate` and commit the result.');
        process.exitCode = 1;
        return;
    }

    for (const file of differing) {
        if (!files.has(file)) {
            await rm(file);
            continue;
        }
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, files.get(file));
    }
    console.log(differing.length === 0 ? 'Nothing changed.' : `Wrote ${differing.length} files.`);
    console.log(summary.text);
};

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
