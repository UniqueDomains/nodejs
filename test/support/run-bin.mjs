/*----------------------------------
- RUN A BUILT BIN
----------------------------------*/

/**
 * Runs a package's `dist/bin.js` in its own process, as a user's shell does. Async, since the fixture server lives in
 * the test's process and a blocking call would never let it answer. The process never inherits a key.
 */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const runBin = (packageName, args, env = {}) => new Promise((resolve) => {
    // A dead base by default: a regressed usage check fails here rather than reaching the live API.
    const clean = { PATH: process.env.PATH, UD_API_BASE: 'http://127.0.0.1:9/v1', ...env };
    execFile(process.execPath, [join(ROOT, 'packages', packageName, 'dist', 'bin.js'), ...args], { encoding: 'utf8', env: clean }, (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout, stderr });
    });
});
