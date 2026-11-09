import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { relative } from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeGenerated } from '../scripts/readme-examples.mjs';
import { runExample } from '../scripts/lib/readme.mjs';
import { loadRecorded, startFixtureServer } from './support/fixture-server.mjs';
import { useTarget } from './support/readme-sdk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README_KEY = 'ud_live_readme_test';
const readmes = writeGenerated();

let server;
const environment = { ...process.env };
before(async () => {
    server = await startFixtureServer();
    useTarget({ base: server.base, origin: server.origin });
    // A key in the environment, as a member's server has it: the examples that pass no key must still call without
    // one, since the generated module's `createClient()` is the README's.
    process.env.UD_API_KEY = README_KEY;
    process.env.RAPIDAPI_KEY = 'rapidapi-test-key';
});
after(async () => {
    useTarget(null);
    process.env.UD_API_KEY = environment.UD_API_KEY;
    if (environment.UD_API_KEY === undefined) delete process.env.UD_API_KEY;
    process.env.RAPIDAPI_KEY = environment.RAPIDAPI_KEY;
    if (environment.RAPIDAPI_KEY === undefined) delete process.env.RAPIDAPI_KEY;
    await server.close();
});

/**
 * What an example must have done, beyond printing: the branch it means to show, or what it sent. An example whose
 * catch-all branch prints any error, or whose key never leaves the client, would pass otherwise (review of 2026-11-09).
 */
const EXPECTED = {
    'sdk/errors': (printed) => assert.deepEqual(printed, [['Needs a key:', 'https://unique.domains/pricing']]),
    'sdk/member-key': () => assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${README_KEY}`),
    'sdk/rapidapi': () => assert.equal(server.requests.at(-1).headers['x-rapidapi-key'], 'rapidapi-test-key'),
};

for (const readme of readmes) {
    const { examples } = await import(pathToFileURL(readme.module).href);
    describe(`${relative(ROOT, readme.file)} examples (plan decision 17)`, () => {
        for (const example of examples) {
            it(example.name, async () => {
                const printed = await runExample(example);
                EXPECTED[`${readme.slug}/${example.name}`]?.(printed);
            });
        }
    });
}

describe('the README examples', () => {
    it('cover both READMEs, and the SDK README opens on the free call printing a status', async () => {
        const sdk = readmes.find((readme) => readme.slug === 'sdk');
        assert.ok(readmes.find((readme) => readme.slug === 'root').examples.length > 0);
        assert.equal(sdk.examples[0].name, 'first-call');
        const { examples } = await import(pathToFileURL(sdk.module).href);
        const printed = await runExample(examples[0]);
        const status = loadRecorded().find((fixture) => fixture.name === 'names-get-name').response.body.data.status;
        assert.deepEqual(printed, [[status]]);
    });
});
