import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LISTINGS } from '../packages/sdk/dist/index.js';
import { writeGenerated } from '../scripts/readme-examples.mjs';
import { runExample } from '../scripts/lib/readme.mjs';
import { loadRecorded, startFixtureServer } from './support/fixture-server.mjs';
import { useTarget } from './support/readme-sdk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README_KEY = 'ud_live_readme_test';
const readmes = writeGenerated();

let server;
const environment = { ...process.env };

const sentTheKey = () => assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${README_KEY}`);
const refusedForTheKey = (printed) => assert.deepEqual(printed, [['Needs a key:', 'https://unique.domains/pricing']]);

/**
 * What an example must have done, beyond printing: the branch it means to show, or what it sent. An example whose
 * catch-all branch prints any error, or whose key never leaves the client, would pass otherwise (review of 2026-11-09).
 */
const EXPECTED = {
    'sdk/errors': (printed) => assert.deepEqual(printed, [['Needs a key or another plan:', 'https://unique.domains/pricing']]),
    'sdk/member-key': () => assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${README_KEY}`),
    'sdk/rapidapi': () => assert.equal(server.requests.at(-1).headers['x-rapidapi-key'], 'rapidapi-test-key'),
    'whois/history': sentTheKey,
    'whois/refused': refusedForTheKey,
    'domain-availability/check': sentTheKey,
    'domain-availability/batch': sentTheKey,
    'domain-availability/refused': refusedForTheKey,
    'registrar-prices/cheapest': sentTheKey,
    'registrar-prices/history': sentTheKey,
    'registrar-prices/refused': refusedForTheKey,
    'domain-appraisal/value': sentTheKey,
    'domain-appraisal/appraise': sentTheKey,
    'domain-appraisal/refused': refusedForTheKey,
    'expired-domains-api/names': sentTheKey,
    'expired-domains-api/expiring': sentTheKey,
    'expired-domains-api/refused': refusedForTheKey,
    'domain-auctions/outcomes': sentTheKey,
    'domain-auctions/refused': refusedForTheKey,
};

const loaded = await Promise.all(readmes.map(async (readme) => ({ readme, examples: (await import(pathToFileURL(readme.module).href)).examples })));

// One outer suite: under Node 20, suites declared after a top-level await ran before a file's top-level `before`, with
// no fixture server set, and spent the live window (found in lane N2).
describe('the README examples, on the fixture server', () => {
    before(async () => {
        server = await startFixtureServer();
        useTarget({ base: server.base, origin: server.origin });
        // A key in the environment, as a member's server has it: the examples that pass no key must still call without
        // one, since the generated module's `createClient()` is the README's.
        process.env.UD_API_KEY = README_KEY;
        process.env.RAPIDAPI_KEY = 'rapidapi-test-key';
    });
    after(async () => {
        useTarget(undefined);
        process.env.UD_API_KEY = environment.UD_API_KEY;
        if (environment.UD_API_KEY === undefined) delete process.env.UD_API_KEY;
        process.env.RAPIDAPI_KEY = environment.RAPIDAPI_KEY;
        if (environment.RAPIDAPI_KEY === undefined) delete process.env.RAPIDAPI_KEY;
        await server.close();
    });

    for (const { readme, examples } of loaded) {
        describe(`${relative(ROOT, readme.file)} examples (plan decision 17)`, () => {
            for (const example of examples) {
                it(example.name, async () => {
                    const printed = await runExample(example);
                    EXPECTED[`${readme.slug}/${example.name}`]?.(printed);
                });
            }
        });
    }

    /**
     * Keyless examples of the packages of lane N that run on the fixture server only, so the nightly stays inside the
     * keyless hourly window (the budget test below): each package's first example still runs live every night.
     */
    const OFF_THE_NIGHTLY = new Set(['expired-domains-api/refused', 'domain-sales/endings', 'domain-sales/word', 'domain-auctions/sample', 'domain-auctions/one-name', 'domain-auctions/refused']);

    const USE_CASE_PACKAGES = ['whois', 'domain-availability', 'registrar-prices', 'domain-appraisal', 'expired-domains-api', 'domain-sales', 'domain-auctions'];

    describe('the use-case READMEs (plan decision 18)', () => {
        for (const slug of USE_CASE_PACKAGES) {
            it(`${slug} opens on the free call, sent without a key, and runs live`, async () => {
                const readme = readmes.find((entry) => entry.slug === slug);
                assert.equal(readme.examples[0].mode, 'run');
                const { examples } = await import(pathToFileURL(readme.module).href);
                await runExample(examples[0]);
                assert.equal(server.requests.at(-1).headers.authorization, undefined);
                assert.equal(server.requests.at(-1).method, 'GET');
            });

            it(`${slug}: no example is skipped, and each fixture-only example shows a key, or is kept off the nightly for its budget`, () => {
                const readme = readmes.find((entry) => entry.slug === slug);
                assert.equal(readme.examples.filter((example) => example.mode === 'skip').length, 0);
                for (const example of readme.examples.filter((entry) => entry.mode === 'fixture')) {
                    if (OFF_THE_NIGHTLY.has(`${slug}/${example.name}`)) assert.doesNotMatch(example.code, /apiKey/, `${example.name} is a keyless call`);
                    else assert.match(example.code, /process\.env\.UD_API_KEY/, example.name);
                }
            });
        }
    });

    describe('the README examples', () => {
        it('cover both READMEs, and the SDK README opens on the free call printing a status', async () => {
            const sdk = readmes.find((readme) => readme.slug === 'sdk');
            assert.ok(readmes.find((readme) => readme.slug === 'root').examples.length > 0);
            assert.equal(sdk.examples[0].name, 'first-call');
            const { examples } = await import(pathToFileURL(sdk.module).href);
            const printed = await runExample(examples[0]);
            const status = loadRecorded().find((fixture) => fixture.name === 'usecase-availability').response.body.data.status;
            assert.deepEqual(printed, [[status]]);
        });
    });

    // Here rather than with the other scripts' tests: the generated modules and the server are this file's, and a
    // second process writing those modules would race with the import above.
    describe('the nightly\'s live calls (review N2-17)', () => {
        it('stay inside the keyless hourly window of 60: the snapshot reads, every call of the smoke and the README examples', async () => {
            const callsOf = new Map();
            for (const { readme, examples } of loaded) {
                for (const example of examples.filter((entry) => entry.mode === 'run')) {
                    const start = server.requests.length;
                    await runExample(example);
                    callsOf.set(`${readme.slug}/${example.name}`, server.requests.length - start);
                }
            }
            for (const [example, calls] of callsOf) assert.ok(calls > 0, `${example} made no call`);
            const publicSetPages = loadRecorded().filter((fixture) => fixture.name.startsWith('tlds-public-set-')).length;
            assert.equal(callsOf.get('root/every-row'), publicSetPages);

            const exampleCalls = [...callsOf.values()].reduce((sum, calls) => sum + calls, 0);
            const SNAPSHOT_READS = LISTINGS.length + 1;
            // Read from the smoke script itself, so a call added there counts here (lane R review): each `await ud(` of
            // the CLI is one call, and each entry of its USE_CASES list is one `npx <package>` line, one call each.
            const smoke = readFileSync(join(ROOT, 'scripts', 'smoke.mjs'), 'utf8');
            const cliCalls = (smoke.match(/await ud\(/g) ?? []).length;
            const useCaseList = /const USE_CASES = \[([\s\S]*?)\n\];/.exec(smoke);
            assert.ok(useCaseList, 'the smoke lists its use-case packages in USE_CASES');
            const useCaseCalls = (useCaseList[1].match(/\{ folder: '/g) ?? []).length;
            assert.ok(/for \(const \{ folder, arg \} of USE_CASES\)/.test(smoke), 'the smoke runs each USE_CASES entry once');
            assert.ok(cliCalls > 0 && useCaseCalls > 0);
            const SMOKE_CALLS = cliCalls + useCaseCalls;
            const HOURLY_WINDOW = 60;
            const total = SNAPSHOT_READS + SMOKE_CALLS + exampleCalls;
            assert.ok(total <= HOURLY_WINDOW, `${total} live calls in one night, over the window of ${HOURLY_WINDOW}: ${SNAPSHOT_READS} snapshot reads + ${SMOKE_CALLS} smoke calls (${cliCalls} CLI, ${useCaseCalls} npx) + ${exampleCalls} README example calls`);
            console.log(`The nightly's live calls: ${total} of ${HOURLY_WINDOW} (${SNAPSHOT_READS} snapshot reads + ${SMOKE_CALLS} smoke calls + ${exampleCalls} README example calls).`);
        });
    });
});
