/*----------------------------------
- README EXAMPLES: EXTRACT AND RENDER
----------------------------------*/

/**
 * Plan decision 17: every JavaScript example of a README is a fenced `js` block right after a marker,
 * `<!-- example: <name> -->`. The block becomes an async function in `test/readme/<readme>.generated.mjs`, run by
 * `npm test` against the fixture server and by `npm run examples:live` against the live free tier.
 *
 * Markers: `<!-- example: <name> -->` runs in both; `<!-- example: <name> fixture -->` runs against the fixture server
 * only (a key the nightly job does not hold); `<!-- example: <name> skip -->` never runs, at most three a README.
 * A block may leave out the import of `createClient` and the `const ud = createClient();` line: the first example of
 * a README shows them, and the rest read as its continuation. A block imports from `@uniquedomains/<package>`, each
 * package through its own module of `test/support`, so an example that names the wrong package fails.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/*----------------------------------
- CONSTANTS
----------------------------------*/

const MARKER = /^<!-- example: ([a-z0-9]+(?:-[a-z0-9]+)*)(?: (skip|fixture))? -->$/;
// Both fence characters and any length, with an info string after the language (CommonMark): ```js title=x, ~~~js.
const FENCE = /^(`{3,}|~{3,})\s*([^\s`]*).*$/;
const SCRIPT_LANGUAGES = new Set(['js', 'javascript', 'mjs', 'cjs', 'ts', 'typescript', 'jsx', 'tsx']);
const PACKAGE_IMPORT = /^import \{([^}]+)\} from '@uniquedomains\/([a-z-]+)';?$/;
export const MAX_SKIPS = 3;

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** A closing fence: the opening's character, at least its length, nothing after it. */
const closesFence = (line, opening) => /^(`+|~+)$/.test(line) && line[0] === opening[0] && line.length >= opening.length;

/** A declaration of `ud` in a line of code, comments left out: the example then needs no client from the prelude. */
const declaresClient = (code) => code.split('\n').some((line) => !line.trim().startsWith('//') && /\b(?:const|let|var)\s+ud\b/.test(line));

/** The examples of one README, in order. Throws on an unmarked script block, a marker without a block, a repeated name. */
export const parseExamples = (markdown, file = 'README.md') => {
    const lines = markdown.split('\n');
    const examples = [];
    let marker = null;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        const markerMatch = MARKER.exec(line);
        if (markerMatch) {
            if (marker) throw new Error(`${file}:${index + 1}: two markers in a row`);
            marker = { name: markerMatch[1], mode: markerMatch[2] ?? 'run', line: index + 1 };
            continue;
        }
        if (line.startsWith('<!-- example')) throw new Error(`${file}:${index + 1}: a marker reads <!-- example: <name> -->, with skip or fixture after the name`);
        const fence = FENCE.exec(line);
        if (!fence) {
            if (marker && line !== '') throw new Error(`${file}:${marker.line}: the marker ${marker.name} is not followed by a js block`);
            continue;
        }
        const language = fence[2].toLowerCase();
        const start = index;
        const body = [];
        for (index++; index < lines.length && !closesFence(lines[index].trim(), fence[1]); index++) body.push(lines[index]);
        if (index >= lines.length) throw new Error(`${file}:${start + 1}: a block that never closes`);
        if (!SCRIPT_LANGUAGES.has(language)) {
            if (marker) throw new Error(`${file}:${marker.line}: the marker ${marker.name} is followed by a ${language || 'plain'} block, not js`);
            continue;
        }
        if (!marker) throw new Error(`${file}:${start + 1}: a ${language} block without <!-- example: <name> --> before it`);
        if (language !== 'js') throw new Error(`${file}:${start + 1}: write examples as js blocks, not ${language}`);
        if (examples.some((example) => example.name === marker.name)) throw new Error(`${file}:${marker.line}: the example name ${marker.name} is used twice`);
        examples.push({ name: marker.name, mode: marker.mode, line: marker.line, code: body.join('\n') });
        marker = null;
    }
    if (marker) throw new Error(`${file}:${marker.line}: the marker ${marker.name} is not followed by a js block`);
    const skips = examples.filter((example) => example.mode === 'skip').length;
    if (skips > MAX_SKIPS) throw new Error(`${file}: ${skips} examples are skipped, at most ${MAX_SKIPS} may be`);
    return examples;
};

/**
 * The module of one README's examples: the imports gathered at the top, each example an async function. `specifierOf`
 * says where a package's import comes from: a string for the SDK alone, or a function of the package's folder name.
 */
export const renderModule = (examples, specifierOf, file = 'README.md') => {
    const specifier = typeof specifierOf === 'string' ? (name) => (name === 'sdk' ? specifierOf : null) : specifierOf;
    const imports = new Map([[specifier('sdk'), new Set(['createClient'])]]);
    const rendered = examples.filter((example) => example.mode !== 'skip').map((example) => {
        const body = [];
        for (const line of example.code.split('\n')) {
            if (!line.startsWith('import ')) {
                body.push(line);
                continue;
            }
            const match = PACKAGE_IMPORT.exec(line.trim());
            const from = match ? specifier(match[2]) : null;
            if (!match || !from) throw new Error(`${file}:${example.line}: ${example.name} imports something other than names from a package of this repository on one line`);
            const names = imports.get(from) ?? new Set();
            for (const name of match[1].split(',').map((entry) => entry.trim()).filter(Boolean)) names.add(name);
            imports.set(from, names);
        }
        const code = body.join('\n').trim();
        const prelude = declaresClient(code) ? '' : '            const ud = createClient();\n';
        return [
            '    {',
            `        name: ${JSON.stringify(example.name)},`,
            `        mode: ${JSON.stringify(example.mode)},`,
            '        run: async () => {',
            `${prelude}${code.split('\n').map((line) => (line ? `            ${line}` : '')).join('\n')}`,
            '        },',
            '    },',
        ].join('\n');
    });
    return [
        `// Generated by scripts/readme-examples.mjs from ${file}. Do not edit: edit the README.`,
        ...[...imports].map(([from, names]) => `import { ${[...names].sort((left, right) => left.localeCompare(right)).join(', ')} } from '${from}';`),
        '',
        'export const examples = [',
        ...rendered,
        '];',
        '',
    ].join('\n');
};

/** The READMEs with examples: the root one and each package's, with the slug of their generated file. */
export const findReadmes = (root) => {
    const packages = readdirSync(join(root, 'packages'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    return [{ file: join(root, 'README.md'), slug: 'root' }, ...packages.map((name) => ({ file: join(root, 'packages', name, 'README.md'), slug: name }))]
        .filter((readme) => existsSync(readme.file))
        .map((readme) => ({ ...readme, examples: parseExamples(readFileSync(readme.file, 'utf8'), relative(root, readme.file)) }));
};

/**
 * Runs one example with `console.log` captured. Prints nothing, or prints `undefined`, and the example fails: an
 * example shows its answer, and an `undefined` is a field the answer does not have.
 */
export const runExample = async (example) => {
    const printed = [];
    const original = console.log;
    console.log = (...args) => { printed.push(args); };
    try {
        await example.run();
    } finally {
        console.log = original;
    }
    if (printed.length === 0) throw new Error(`${example.name} printed nothing`);
    const blank = printed.findIndex((args) => args.some((arg) => arg === undefined));
    if (blank >= 0) throw new Error(`${example.name} printed undefined in line ${blank + 1}: ${printed[blank].map(String).join(' ')}`);
    return printed;
};
