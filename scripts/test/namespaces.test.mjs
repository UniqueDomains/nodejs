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

    it('keep the four text operations on meta', () => {
        const text = operations.filter((operation) => operation.answer === 'text').map((operation) => operation.id);
        assert.equal(text.length, 4);
        for (const id of text) assert.match(where(id), /^meta\./, id);
    });

    it('apply the rule: strip the verb and the noun, camel-case the rest', () => {
        assert.equal(methodNameOf('get_name', 'names'), 'get');
        assert.equal(methodNameOf('list_tlds', 'tlds'), 'list');
        assert.equal(methodNameOf('batch_names', 'names'), 'batch');
        assert.equal(methodNameOf('list_tld_application_changes', 'tlds'), 'applicationChanges');
    });

    it('throw on a repeated method and on a tag with no namespace', () => {
        // `get_names` reads as `names.get`, which `get_name` already is.
        const twice = [...operations, { ...operations.find((operation) => operation.id === 'get_name'), id: 'get_names' }];
        assert.throws(() => buildNamespaces(twice), /both names\.get/);
        assert.throws(() => buildNamespaces([...operations, { ...operations[0], id: 'get_thing', tag: 'things' }]), /no namespace for the tag things/);
    });

    it('know the 21 paged operations', () => {
        assert.equal(entries.filter((entry) => entry.paged).length, 21);
    });

    it('write a JSDoc example for every method', () => {
        const source = buildNamespacesSource(document, operations);
        assert.equal(source.match(/@example/g).length, operations.length);
        assert.match(source, /const answer = await ud\.names\.get\('lantern\.io'\);/);
        assert.match(source, /for await \(const row of ud\.tlds\.list\(\)\) console\.log\(row\);/);
        assert.match(source, /ud\.prices\.ianaRegistrar\(1861\)/);
    });
});
