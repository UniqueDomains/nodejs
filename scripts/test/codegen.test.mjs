import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOperations, listingIdsOf, reduceListing } from '../lib/codegen.mjs';
import { summarizeChanges } from '../lib/summary.mjs';

const tinyDocument = () => ({
    openapi: '3.1.0',
    info: { title: 'Unique Domains API', version: '1.0.0' },
    servers: [{ url: 'https://api.unique.domains/v1' }],
    tags: [{ name: 'tlds', description: 'TLD Intelligence: Every ending.' }],
    paths: {
        '/meta/openapi.json': { get: { operationId: 'get_openapi', tags: ['shared'], 'x-tier': 'free', parameters: [{ name: 'listing', in: 'query', schema: { type: 'string', enum: ['tlds', 'whois'] } }], responses: { 200: { content: { 'application/json': {} } } } } },
        '/tlds/{tld}/changes': {
            get: {
                operationId: 'list_tld_changes',
                tags: ['tlds'],
                'x-tier': 'free',
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                    { name: 'tld', in: 'path', required: true, schema: { type: 'string' } },
                ],
                responses: { 200: { content: { 'application/json': {}, 'text/csv': {} } } },
            },
        },
        '/names/batch': {
            post: {
                operationId: 'batch_names',
                tags: ['names'],
                'x-tier': 'keyed',
                'x-plan': 'investor',
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['names'], properties: { names: { type: 'array', items: { type: 'string' } } } } } } },
                responses: { 200: {} },
            },
        },
    },
});

describe('codegen', () => {
    it('reads the listing ids from get_openapi', () => {
        assert.deepEqual(listingIdsOf(tinyDocument()), ['tlds', 'whois']);
    });

    it('orders path parameters first and reads tier, plan, csv, body', () => {
        const [openapi, changes, batch] = buildOperations(tinyDocument());
        assert.equal(openapi.answer, 'text');
        assert.deepEqual(changes.parameters.map((param) => param.name), ['tld', 'limit']);
        assert.equal(changes.csv, true);
        assert.equal(changes.answer, 'json');
        assert.equal(batch.tier, 'keyed');
        assert.equal(batch.plan, 'investor');
        assert.deepEqual(batch.body.properties, [{ name: 'names', required: true, type: 'array', items: { type: 'string' } }]);
    });

    it('lets an operation parameter override the path item one', () => {
        const document = tinyDocument();
        document.paths['/tlds/{tld}/changes'].parameters = [{ name: 'tld', in: 'path', required: true, description: 'path level', schema: { type: 'string' } }];
        const changes = buildOperations(document).find((operation) => operation.id === 'list_tld_changes');
        assert.equal(changes.parameters.filter((param) => param.name === 'tld').length, 1);
    });

    it('fails on a parameter type it does not know', () => {
        const document = tinyDocument();
        document.paths['/tlds/{tld}/changes'].get.parameters[0].schema = { type: 'object' };
        assert.throws(() => buildOperations(document), /unsupported type/);
    });

    it('reduces a listing document to its host and operations', () => {
        const listing = { info: { title: 'Unique Domains API: WHOIS Lookup' }, paths: { '/a': { get: { operationId: 'a', 'x-rapidapi-host': 'w.p.rapidapi.com' } }, '/b': { get: { operationId: 'b', 'x-rapidapi-host': 'w.p.rapidapi.com' } } } };
        assert.deepEqual(reduceListing('whois', listing), { id: 'whois', title: 'WHOIS Lookup', host: 'w.p.rapidapi.com', operations: ['a', 'b'] });
        listing.paths['/b'].get['x-rapidapi-host'] = 'other.p.rapidapi.com';
        assert.throws(() => reduceListing('whois', listing), /one RapidAPI host/);
    });

    it('summarizes added, changed and removed operations', () => {
        const previous = { document: tinyDocument(), listings: [{ id: 'tlds', title: 'T', host: 'h', operations: ['list_tld_changes'] }] };
        const next = { document: tinyDocument(), listings: [{ id: 'tlds', title: 'T', host: 'h2', operations: ['list_tld_changes', 'get_openapi'] }] };
        delete next.document.paths['/names/batch'];
        next.document.paths['/tlds/{tld}/changes'].get.summary = 'Changed.';
        next.document.paths['/x'] = { get: { operationId: 'get_x' } };
        const summary = summarizeChanges(previous, next);
        assert.ok(summary.changed);
        assert.match(summary.text, /added get_x/);
        assert.match(summary.text, /changed list_tld_changes/);
        assert.match(summary.text, /removed batch_names/);
        assert.match(summary.text, /listing tlds: host h to h2; adds get_openapi/);
        assert.equal(summarizeChanges(previous, previous).changed, false);
    });
});
