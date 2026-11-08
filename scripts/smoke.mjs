#!/usr/bin/env node
/*----------------------------------
- SMOKE: THE BUILT CLI AGAINST THE LIVE FREE API
----------------------------------*/

/**
 * Runs the built `ud` bin as a user would, keyless, against the public host: `get-name harbor.io` and
 * `list-tlds --limit 3 --json`. Two keyless calls; run by the nightly contract workflow, never by `npm test`, so the
 * tests stay offline.
 */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cli', 'dist', 'bin.js');
const exec = promisify(execFile);
// A member or RapidAPI key in the runner's environment would change what the free path answers.
const env = { ...process.env, UD_API_KEY: '', UD_RAPIDAPI_KEY: '' };

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
