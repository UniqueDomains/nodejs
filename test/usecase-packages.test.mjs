import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTINGS, NAMESPACE_METHODS, OPERATIONS } from '../packages/sdk/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HUB = 'https://rapidapi.com/dopamyn-network-dopamyn-network-default/api/';
const DOCUMENT = JSON.parse(readFileSync(join(ROOT, 'openapi', 'v1.json'), 'utf8'));
const read = (dir, file) => readFileSync(join(ROOT, 'packages', dir, file), 'utf8');

/** Every function of a package, the operation it calls, and whether the README calls it free. */
const PACKAGES = [
    {
        dir: 'whois', title: 'WHOIS lookup for Node.js, with history', bin: 'ud-whois', listing: 'whois', page: 'whois', phrase: 'whois', keywords: ['whois', 'rdap', 'domain', 'registry', 'dns'],
        functions: { whois: 'get_name_registry', dns: 'get_name_dns', whoisHistory: 'get_name_registry_history' },
    },
    {
        dir: 'domain-availability', title: 'Domain availability check for Node.js', bin: 'ud-availability', listing: 'availability', page: 'availability', phrase: 'domain-availability', keywords: ['domain-availability'],
        functions: { availability: 'get_name', check: 'check_name', availabilityBatch: 'batch_names' },
    },
    {
        dir: 'registrar-prices', title: 'Registrar price comparison for Node.js', bin: 'ud-prices', listing: 'price-comparison', page: 'price-comparison', phrase: 'registrar-prices', keywords: ['registrar-prices'],
        functions: { pricesForTld: 'list_tld_prices', renewalTraps: 'list_price_traps', priceChanges: 'list_price_changes', cheapest: 'list_cheapest_prices', priceHistory: 'list_tld_price_history' },
    },
    {
        dir: 'domain-appraisal', title: 'Domain appraisal for Node.js', bin: 'ud-appraise', listing: 'appraisal', page: 'appraisal', phrase: 'domain-appraisal', keywords: ['domain-appraisal'],
        functions: { comparableSales: 'get_name_comps', appraisal: 'get_name_value', appraise: 'appraise_name' },
    },
];

const operationOf = (id) => {
    for (const item of Object.values(DOCUMENT.paths)) for (const operation of Object.values(item)) if (operation?.operationId === id) return operation;
    throw new Error(`no operation ${id}`);
};

const sectionOfFunction = (readme, name) => {
    const at = readme.search(new RegExp(`\\b${name}\\(`));
    assert.ok(at >= 0, `the README never calls ${name}`);
    const start = readme.lastIndexOf('\n## ', at);
    return readme.slice(start, at);
};

/** What a README states in words, against the document's text or a recorded answer. */
const FIGURES = [
    { dir: 'registrar-prices', says: 'you read eight rows', holds: () => recordedData('usecase-price-traps').length === 8 && /8 rows/.test(operationOf('list_price_traps').description) },
    { dir: 'registrar-prices', says: 'you read the ten newest', holds: () => recordedData('usecase-price-changes').length === 10 && /10 newest/.test(operationOf('list_price_changes').description) },
    { dir: 'domain-appraisal', says: 'its last 20 estimates', holds: () => /last 20 estimates/.test(operationOf('get_name_value').summary) },
    { dir: 'domain-appraisal', says: 'in about 30 seconds', holds: () => /Retry-After: 30/.test(operationOf('appraise_name').description) },
    { dir: 'domain-availability', says: 'Up to 100 names', holds: () => /up to 100 names/.test(operationOf('batch_names').summary) },
    { dir: 'registrar-prices', says: 'up to 100 endings', holds: () => /up to 100 endings/.test(operationOf('list_cheapest_prices').summary) },
];

const recordedData = (name) => JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'recorded', `${name}.json`), 'utf8')).response.body.data;

describe('the figures the READMEs state (review N2-21)', () => {
    for (const figure of FIGURES) {
        it(`${figure.dir}: "${figure.says}"`, () => {
            assert.ok(read(figure.dir, 'README.md').includes(figure.says), 'the README says it');
            assert.ok(figure.holds(), 'the document or a recorded answer agrees');
        });
    }
});

describe('the use-case packages (plan decision 18)', () => {
    const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const version = JSON.parse(read('sdk', 'package.json')).version;

    it('the root scripts and the pack check name every package (review N2-15)', () => {
        const pack = readFileSync(join(ROOT, 'scripts', 'check-pack.mjs'), 'utf8');
        for (const workspace of root.workspaces) {
            assert.ok(root.scripts.build.includes(`--workspace ${workspace}`), `build: ${workspace}`);
            assert.ok(root.scripts.typecheck.includes(`tsc -p ${workspace}`), `typecheck: ${workspace}`);
        }
        for (const spec of PACKAGES) assert.ok(pack.includes(`name: '${spec.dir}'`), `check-pack: ${spec.dir}`);
        assert.deepEqual(PACKAGES.map((spec) => `packages/${spec.dir}`), root.workspaces.filter((workspace) => !/\/(sdk|cli)$/.test(workspace)));
    });

    it('every package folder is a workspace, the SDK first', () => {
        assert.deepEqual([...root.workspaces].sort(), readdirSync(join(ROOT, 'packages')).filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json'))).map((dir) => `packages/${dir}`).sort());
        assert.equal(root.workspaces[0], 'packages/sdk');
    });

    for (const spec of PACKAGES) {
        describe(spec.dir, () => {
            const manifest = JSON.parse(read(spec.dir, 'package.json'));
            const readme = read(spec.dir, 'README.md');

            it('depends on the SDK at the lockstep version, nothing else', () => {
                assert.equal(manifest.name, `@uniquedomains/${spec.dir}`);
                assert.equal(manifest.version, version);
                assert.deepEqual(manifest.dependencies, { '@uniquedomains/sdk': version });
            });

            it('publishes its code, its README and its license, publicly, with the repository\'s folder', () => {
                assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE']);
                assert.equal(manifest.publishConfig.access, 'public');
                assert.equal(manifest.repository.directory, `packages/${spec.dir}`);
                assert.equal(manifest.engines.node, '>=20');
            });

            it('has one bin, ud-prefixed, so it shadows no system command, and its source says the same name and listing', () => {
                assert.deepEqual(manifest.bin, { [spec.bin]: 'dist/bin.js' });
                assert.match(spec.bin, /^ud-/);
                const bin = read(spec.dir, 'src/bin.ts');
                assert.ok(bin.includes(`bin: '${spec.bin}'`), 'the name in --help and errors');
                assert.ok(bin.includes(`listing: '${spec.listing}'`), 'the listing of a --rapidapi-key');
            });

            it('carries the searched phrase in its title, its description and its keywords', () => {
                assert.equal(readme.split('\n')[0], `# ${spec.title}`);
                assert.ok(manifest.description.startsWith(spec.title.split(',')[0]), manifest.description);
                for (const keyword of spec.keywords) assert.ok(manifest.keywords.includes(keyword), keyword);
            });

            it('links its RapidAPI listing, its use-case page and the plans by name', () => {
                const listing = LISTINGS.find((entry) => entry.id === spec.listing);
                assert.ok(listing, spec.listing);
                assert.ok(readme.includes(`${HUB}${listing.host.split('.')[0]})`), listing.host);
                assert.ok(readme.includes(`listing: '${spec.listing}'`));
                assert.ok(readme.includes(`https://unique.domains/api/${spec.page})`));
                assert.ok(readme.includes('Founder and Investor plans'));
                assert.ok(readme.includes('https://unique.domains/pricing'));
            });

            it('names a listing beside its own for a function its own does not serve', () => {
                const listing = LISTINGS.find((entry) => entry.id === spec.listing);
                const others = Object.values(spec.functions).filter((id) => !listing.operations.includes(id));
                for (const id of others) {
                    const serving = LISTINGS.find((entry) => entry.operations.includes(id));
                    assert.ok(readme.includes(`${HUB}${serving.host.split('.')[0]})`), `${id} is served by ${serving.id}`);
                }
            });

            it('each function reads its operation, and the README says which need a key and which the Investor plan', () => {
                const source = read(spec.dir, 'src/index.ts');
                for (const [name, id] of Object.entries(spec.functions)) {
                    assert.ok(OPERATIONS[id], id);
                    const called = new RegExp(`export const ${name} = [\\s\\S]*?return ud\\.(\\w+)\\.(\\w+)\\(`).exec(source);
                    assert.ok(called, `${name} calls a namespaced method`);
                    assert.equal(NAMESPACE_METHODS[called[1]][called[2]], id, `${name} calls ud.${called[1]}.${called[2]}`);
                    const operation = operationOf(id);
                    // The words right before the function's first call: its own section, up to that call.
                    const words = sectionOfFunction(readme, name);
                    if (operation['x-tier'] === 'keyed') assert.match(words, /needs? a key|## With a key/i, `${name} needs a key`);
                    else assert.doesNotMatch(words, /needs? a key/i, `${name} is free`);
                    if (operation['x-plan'] === 'investor') assert.match(words, /Investor plan/, `${name} needs the Investor plan`);
                    else assert.doesNotMatch(words, /Investor plan/, `${name} needs no Investor plan`);
                }
            });

            it('its first paragraph names what is free', () => {
                assert.match(readme.split('\n')[2], /free/);
            });

        });
    }

    it('the appraisal README opens by saying the value needs a key and the comparable sales are free (decision 48)', () => {
        assert.match(read('domain-appraisal', 'README.md').split('\n')[2], /^The value needs a key\. The comparable sales are free/);
    });
});
