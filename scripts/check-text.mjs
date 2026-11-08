#!/usr/bin/env node
/*----------------------------------
- CHECK TEXT: THE WRITING RULES OF UNIQUE DOMAINS
----------------------------------*/

/**
 * Fails when a file written by hand in this repository carries a character or a word the project's writing rules
 * ban: the em dash, and the internal name of the scanner (say "scanner"). The snapshot and the generated files are
 * the API's own published text and are checked by the API's repository, so they are left out here.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'generated']);
const SKIP_FILES = new Set(['package-lock.json', 'openapi.json']);
const SKIP_PATHS = [join(ROOT, 'openapi'), join(ROOT, 'test', 'fixtures', 'recorded')];
const TEXT = /\.(m?[jt]s|json|md|ya?ml|txt)$|^LICENSE$/;

// Built from parts so this file does not trip its own check.
const BANNED = [
    { pattern: new RegExp(String.fromCharCode(0x2014)), label: 'an em dash' },
    { pattern: new RegExp(`\\b${['dae', 'mon'].join('')}\\b`, 'i'), label: 'the internal name of the scanner (write "scanner")' },
];

const walk = async (dir) => {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (SKIP_PATHS.some((skip) => path.startsWith(skip))) continue;
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) files.push(...(await walk(path)));
        } else if (TEXT.test(entry.name) && !SKIP_FILES.has(entry.name)) {
            files.push(path);
        }
    }
    return files;
};

const problems = [];
for (const file of await walk(ROOT)) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
        for (const { pattern, label } of BANNED) if (pattern.test(line)) problems.push(`${relative(ROOT, file)}:${index + 1}: ${label}`);
    });
}

if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
} else {
    console.log('The text rules hold.');
}
