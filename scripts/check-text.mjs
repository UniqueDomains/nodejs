#!/usr/bin/env node
/*----------------------------------
- CHECK TEXT: THE WRITING RULES OF UNIQUE DOMAINS
----------------------------------*/

/**
 * Fails when a file written by hand in this repository carries a character or a word the project's writing rules
 * ban: the em dash, and the internal name of the scanner (say "scanner"). A file a reader sees (every one but the
 * tests and the scripts) also may not say where the data comes from, when it was read, or that AI made it
 * (`lib/text-rules.mjs`). The snapshot and the generated files are the API's own published text and are checked by
 * the API's repository, so they are left out here. An optional first argument checks another folder.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brokenRules, isReaderFile, joinedText, READER_RULES } from './lib/text-rules.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.next']);
const SKIP_FILES = new Set(['package-lock.json']);
// Exact paths, so a hand-written file cannot be skipped by its name (review of lane N, m3): the API document's
// snapshot and its copy in the SDK, the files generated from it, and the recorded fixtures.
const SKIP_EXACT = new Set([join(ROOT, 'packages', 'sdk', 'openapi.json')]);
const SKIP_PATHS = ['openapi', join('packages', 'sdk', 'src', 'generated'), join('test', 'fixtures', 'recorded')].map((path) => join(ROOT, path) + sep);
// Every hand-written text file type, `.gitignore` included (review R1-13).
const TEXT = /\.([mc]?[jt]s|[jt]sx|gs|json|md|ya?ml|txt|html|css|sh)$|^(LICENSE|\.gitignore)$/;

// Built from parts so this file does not trip its own check.
const BANNED = [
    { pattern: new RegExp(String.fromCharCode(0x2014)), label: 'an em dash' },
    // No closing boundary, so the plural and every suffixed form are caught too (review R1-13).
    { pattern: new RegExp(`\\b${['dae', 'mon'].join('')}`, 'i'), label: 'the internal name of the scanner (write "scanner")' },
];

const LABELS = new Map(READER_RULES.map(({ id, label }) => [id, label]));

const walk = async (dir) => {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (SKIP_EXACT.has(path) || SKIP_PATHS.some((skip) => `${path}${sep}`.startsWith(skip))) continue;
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
    const path = relative(ROOT, file);
    const reader = isReaderFile(path);
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
        for (const { pattern, label } of BANNED) if (pattern.test(line)) problems.push(`${path}:${index + 1}: ${label}`);
        if (reader) for (const id of brokenRules(line)) problems.push(`${path}:${index + 1}: ${LABELS.get(id)}`);
    });
    if (reader) {
        // A phrase split by a line wrap: reported once for the file when no single line breaks that rule.
        const byLine = new Set(lines.flatMap((line) => brokenRules(line)));
        for (const id of brokenRules(joinedText(lines))) if (!byLine.has(id)) problems.push(`${path}: ${LABELS.get(id)} (across a line wrap)`);
    }
}

if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
} else {
    console.log('The text rules hold.');
}
