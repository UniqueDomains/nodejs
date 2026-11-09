import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNamespaces, buildNamespacesSource, buildOperations, METHOD_OVERRIDES, methodNameOf, NAMESPACES } from '../lib/codegen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const document = JSON.parse(readFileSync(join(ROOT, 'openapi', 'v1.json'), 'utf8'));
const operations = buildOperations(document);
const entries = buildNamespaces(operations);
const where = (id) => { const entry = entries.find((candidate) => candidate.id === id); return `${entry.namespace}.${entry.method}`; };

describe('namespaces (plan decision 13)', () => {
    it('give every served operation exactly one method', () => {
        assert.equal(entries.length, operations.length);
        assert.deepEqual(entries.map((entry) => entry.id).sort(), operations.map((operation) => operation.id).sort());
    });

    it('keep every method name unique in its namespace', () => {
        const names = entries.map((entry) => `${entry.namespace}.${entry.method}`);
        assert.equal(new Set(names).size, names.length);
    });

    it('use the ten namespaces, each with methods', () => {
        assert.deepEqual(NAMESPACES, ['names', 'words', 'domains', 'tlds', 'prices', 'market', 'trends', 'agenda', 'editions', 'meta']);
        for (const namespace of NAMESPACES) assert.ok(entries.some((entry) => entry.namespace === namespace), namespace);
        assert.ok(entries.every((entry) => NAMESPACES.includes(entry.namespace)));
    });

    it('read the ids as the plan names them', () => {
        const expected = {
            get_name: 'names.get', get_name_registry: 'names.registry', get_name_dns: 'names.dns', get_name_registry_history: 'names.registryHistory',
            list_words: 'words.list', list_domains: 'domains.list', list_expiring_domains: 'domains.expiring',
            get_domain_drops: 'domains.drops', get_market_sales: 'market.sales', list_market_sales_series: 'market.salesSeries',
            get_catalog_stats: 'domains.stats', list_tld_prices: 'prices.tld', list_price_traps: 'prices.traps', list_cheapest_prices: 'prices.cheapest',
            list_tld_price_history: 'prices.tldHistory', list_price_changes: 'prices.changes', get_key: 'meta.key',
            get_latest_edition: 'editions.latest', request_word: 'words.request', get_word_request: 'words.requestStatus',
        };
        for (const [id, method] of Object.entries(expected)) assert.equal(where(id), method, id);
    });

    it('name only existing ids in the override map, and throw on one that is not', () => {
        const ids = new Set(operations.map((operation) => operation.id));
        for (const id of Object.keys(METHOD_OVERRIDES)) assert.ok(ids.has(id), id);
        METHOD_OVERRIDES.no_such_operation = 'meta.nothing';
        try {
            assert.throws(() => buildNamespaces(operations), /no_such_operation/);
        } finally {
            delete METHOD_OVERRIDES.no_such_operation;
        }
    });

    it('keep the API\'s own two files on meta and the calendar feeds on agenda (Gaetan\'s 1B)', () => {
        const text = operations.filter((operation) => operation.answer === 'text').map((operation) => where(operation.id)).sort();
        assert.deepEqual(text, ['agenda.eventsIcs', 'agenda.ics', 'meta.llmsTxt', 'meta.openapi']);
        assert.equal(where('get_events_ics'), 'agenda.eventsIcs');
        assert.equal(where('get_agenda_ics'), 'agenda.ics');
    });

    it('apply the rule: strip the verb and the noun, camel-case the rest', () => {
        assert.equal(methodNameOf('get_name', 'names'), 'get');
        assert.equal(methodNameOf('list_tlds', 'tlds'), 'list');
        assert.equal(methodNameOf('batch_names', 'names'), 'batch');
        assert.equal(methodNameOf('list_tld_application_changes', 'tlds'), 'applicationChanges');
    });

    it('throw on a repeated method', () => {
        // `get_names` reads as `names.get`, which `get_name` already is.
        const twice = [...operations, { ...operations.find((operation) => operation.id === 'get_name'), id: 'get_names' }];
        assert.throws(() => buildNamespaces(twice), /both names\.get/);
    });

    it('derive a namespace for a new tag or shared path, so the nightly still opens its pull request (review M1)', () => {
        const added = [
            { ...operations[0], id: 'get_thing', tag: 'things', path: '/things/{name}' },
            { ...operations[0], id: 'list_things', tag: 'things', path: '/things' },
            { ...operations[0], id: 'list_tld_watches', tag: 'tld-watches', path: '/tld-watches' },
            { ...operations[0], id: 'get_status_page', tag: 'shared', path: '/status/page' },
        ];
        const derived = buildNamespaces([...operations, ...added]).slice(operations.length).map((entry) => `${entry.namespace}.${entry.method}`);
        assert.deepEqual(derived, ['things.get', 'things.list', 'tldWatches.tldWatches', 'status.page']);
        const withThings = { ...document, paths: { ...document.paths, '/things/{name}': { get: document.paths['/names/{name}'].get } } };
        const source = buildNamespacesSource(withThings, [...operations, { ...operations[0], id: 'get_thing', tag: 'things', path: '/things/{name}' }]);
        assert.match(source, /^ {4}things: \{\n {8}get: "get_thing"/m);
        assert.match(source, /ud\.things\.get\('get\.plumbing'\)/);
    });

    it('refuse an override outside the namespaces, or without a method (review m8)', () => {
        for (const target of ['domain.stats', 'domains', 'domains.']) {
            METHOD_OVERRIDES.get_catalog_stats = target;
            try {
                assert.throws(() => buildNamespaces(operations), /METHOD_OVERRIDES maps get_catalog_stats/);
            } finally {
                METHOD_OVERRIDES.get_catalog_stats = 'domains.stats';
            }
        }
    });

    it('write examples a reader cannot paste blind, and keep a comment closed (review m8)', () => {
        const withParam = (param, extra = {}) => {
            const path = '/names/{name}';
            const base = document.paths[path].get;
            const custom = { ...document, paths: { ...document.paths, [path]: { get: { ...base, ...extra } } } };
            const operation = { ...operations.find((entry) => entry.id === 'get_name'), parameters: [param] };
            return buildNamespacesSource(custom, operations.map((entry) => (entry.id === 'get_name' ? operation : entry)));
        };
        const path = { name: 'name', in: 'path', required: true, description: '' };
        assert.match(withParam({ ...path, type: 'integer', example: '0' }), /ud\.names\.get\(0\);/);
        assert.match(withParam({ ...path, type: 'string' }), /ud\.names\.get\(name\);/);
        assert.match(withParam({ ...path, type: 'integer', example: 'many' }), /ud\.names\.get\(name\);/);
        assert.match(withParam({ ...path, type: 'string', enum: ['founder', 'investor'] }), /ud\.names\.get\('founder'\);/);
        assert.match(withParam({ ...path, type: 'string', example: 'a*/b' }), /ud\.names\.get\('a\*\\\/b'\);/);
    });

    it('mark a method the document marks deprecated (review m3)', () => {
        const custom = { ...document, paths: { ...document.paths, '/meta/tlds': { get: { ...document.paths['/meta/tlds'].get, deprecated: true } } } };
        const summary = operations.find((entry) => entry.id === 'get_meta_tlds').summary;
        assert.ok(buildNamespacesSource(custom, operations).includes(`@deprecated ${summary}`));
        assert.doesNotMatch(buildNamespacesSource(document, operations), /@deprecated/);
    });

    it('know the 21 paged operations', () => {
        assert.equal(entries.filter((entry) => entry.paged).length, 21);
    });

    it('write a JSDoc example for every method', () => {
        const source = buildNamespacesSource(document, operations);
        assert.equal(source.match(/@example/g).length, operations.length);
        assert.match(source, /const answer = await ud\.names\.get\('get\.plumbing'\);/);
        assert.match(source, /for await \(const row of ud\.tlds\.list\(\)\) console\.log\(row\);/);
        assert.match(source, /ud\.prices\.ianaRegistrar\(1861\)/);
    });
});
