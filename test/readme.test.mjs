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
const readmes = writeGenerated();

let server;
const environment = { ...process.env };
before(async () => {
    server = await startFixtureServer();
    useTarget({ base: server.base, origin: server.origin });
    delete process.env.UD_API_KEY;
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

for (const readme of readmes) {
    const { examples } = await import(pathToFileURL(readme.module).href);
    describe(`${relative(ROOT, readme.file)} examples (plan decision 17)`, () => {
        for (const example of examples) it(example.name, async () => { await runExample(example); });
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
