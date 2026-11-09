import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExamples, renderModule, runExample } from '../lib/readme.mjs';

const block = (marker, code, language = 'js') => `${marker}\n\`\`\`${language}\n${code}\n\`\`\`\n`;

describe('README examples (plan decision 17)', () => {
    it('read marked js blocks with their mode, and leave other blocks alone', () => {
        const markdown = ['# Title', '```bash', 'npm install x', '```', block('<!-- example: one -->', 'console.log(1);'), block('<!-- example: two fixture -->', 'console.log(2);'), block('<!-- example: three skip -->', 'x;')].join('\n');
        assert.deepEqual(parseExamples(markdown).map(({ name, mode }) => [name, mode]), [['one', 'run'], ['two', 'fixture'], ['three', 'skip']]);
    });

    it('refuse an unmarked script block, a marker before another block, a repeated name and a ts block', () => {
        assert.throws(() => parseExamples('```js\nx;\n```\n'), /without <!-- example/);
        assert.throws(() => parseExamples(block('<!-- example: one -->', 'npm i', 'bash')), /not js/);
        assert.throws(() => parseExamples(block('<!-- example: one -->', 'a;') + block('<!-- example: one -->', 'b;')), /used twice/);
        assert.throws(() => parseExamples(block('<!-- example: one -->', 'a;', 'ts')), /as js blocks/);
        assert.throws(() => parseExamples('<!-- example: one -->\nSome text.\n'), /not followed by a js block/);
        assert.throws(() => parseExamples('<!-- example: One -->\n'), /a marker reads/);
    });

    it('read tilde fences, longer fences and an info string after the language (review m7)', () => {
        const read = (markdown) => parseExamples(markdown).map(({ name, code }) => [name, code]);
        assert.deepEqual(read('<!-- example: tilde -->\n~~~js\na;\n~~~\n'), [['tilde', 'a;']]);
        assert.deepEqual(read('<!-- example: info -->\n```js title=x\nb;\n```\n'), [['info', 'b;']]);
        assert.deepEqual(read('<!-- example: long -->\n````js\n```\nc;\n````\n'), [['long', '```\nc;']]);
        assert.throws(() => parseExamples('~~~js\na;\n~~~\n'), /without <!-- example/);
        assert.throws(() => parseExamples('```js title=x\na;\n```\n'), /without <!-- example/);
    });

    it('add the client unless a line of code declares it, any way (review m7)', () => {
        const prelude = (code) => /const ud = createClient\(\);\n/.test(renderModule(parseExamples(block('<!-- example: one -->', code)), './sdk.mjs').replace(code, ''));
        assert.equal(prelude('console.log(ud);'), true);
        assert.equal(prelude('let ud = createClient({ retry: true });'), false);
        assert.equal(prelude('var ud = createClient();'), false);
        assert.equal(prelude('// const ud = createClient({ apiKey });\nconsole.log(ud);'), true);
    });

    it('count the skips, failing above three', () => {
        const skips = (count) => Array.from({ length: count }, (_, index) => block(`<!-- example: s${index} skip -->`, 'x;')).join('\n');
        assert.equal(parseExamples(skips(3)).length, 3);
        assert.throws(() => parseExamples(skips(4)), /4 examples are skipped, at most 3/);
    });

    it('gather the SDK imports and add the client where an example leaves it out', () => {
        const source = renderModule(parseExamples([
            block('<!-- example: first -->', "import { createClient } from '@uniquedomains/sdk';\n\nconst ud = createClient();\nconsole.log(ud);"),
            block('<!-- example: next -->', "import { RateLimitError } from '@uniquedomains/sdk';\nconsole.log(ud, RateLimitError);"),
            block('<!-- example: never skip -->', 'throw new Error();'),
        ].join('\n')), './sdk.mjs');
        assert.match(source, /^import \{ createClient, RateLimitError \} from '\.\/sdk\.mjs';$/m);
        assert.equal(source.match(/const ud = createClient\(\);/g).length, 2);
        assert.doesNotMatch(source, /never/);
        assert.throws(() => renderModule(parseExamples(block('<!-- example: other -->', "import fs from 'node:fs';")), './sdk.mjs'), /imports something other/);
    });

    it('fail an example that prints nothing or prints undefined', async () => {
        assert.deepEqual(await runExample({ name: 'ok', run: async () => console.log('a', null) }), [['a', null]]);
        await assert.rejects(runExample({ name: 'quiet', run: async () => {} }), /printed nothing/);
        await assert.rejects(runExample({ name: 'blank', run: async () => console.log('a', undefined) }), /printed undefined/);
    });
});
