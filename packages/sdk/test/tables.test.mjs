import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { findListing, LISTINGS, listingsServing, OPERATIONS, parseRetryAfter, TAGS } from '../dist/index.js';

const require = createRequire(import.meta.url);
const SHARED = Object.values(OPERATIONS).filter((operation) => operation.tag === 'shared').map((operation) => operation.id);

describe('the listing table', () => {
    it('holds the sixteen listings, each on its own RapidAPI host', () => {
        assert.equal(LISTINGS.length, 16);
        assert.equal(new Set(LISTINGS.map((listing) => listing.host)).size, 16);
        for (const listing of LISTINGS) assert.match(listing.host, /^[a-z0-9-]+\.p\.rapidapi\.com$/);
    });

    it('puts get_name in names, and the registry record and its history in whois', () => {
        assert.ok(findListing('names').operations.includes('get_name'));
        assert.ok(findListing('whois').operations.includes('get_name_registry'));
        assert.ok(findListing('whois').operations.includes('get_name_registry_history'));
        assert.equal(findListing('whois').host, 'whois-lookup24.p.rapidapi.com');
    });

    it('serves the shared paths on every listing', () => {
        assert.ok(SHARED.length > 0);
        for (const listing of LISTINGS) for (const id of SHARED) assert.ok(listing.operations.includes(id), `${listing.id} lacks ${id}`);
    });

    it('names only operations of the document', () => {
        for (const listing of LISTINGS) for (const id of listing.operations) assert.ok(OPERATIONS[id], `${listing.id} names unknown ${id}`);
    });

    it('serves every non-shared operation from at least one listing', () => {
        for (const operation of Object.values(OPERATIONS)) assert.ok(listingsServing(operation.id).length > 0, `${operation.id} is in no listing`);
    });
});

describe('the operation table', () => {
    it('is keyed by operation id and in step with the snapshot', () => {
        const document = require('../openapi.json');
        let count = 0;
        for (const [path, item] of Object.entries(document.paths)) {
            for (const [method, operation] of Object.entries(item)) {
                if (!operation.operationId) continue;
                count++;
                const entry = OPERATIONS[operation.operationId];
                assert.equal(entry.path, path);
                assert.equal(entry.method, method.toUpperCase());
                assert.equal(entry.tier, operation['x-tier']);
            }
        }
        assert.equal(Object.keys(OPERATIONS).length, count);
    });

    it('lists path parameters first, in path order', () => {
        for (const operation of Object.values(OPERATIONS)) {
            const inPath = [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
            assert.deepEqual(operation.parameters.slice(0, inPath.length).map((param) => param.name), inPath, operation.id);
            assert.ok(operation.parameters.slice(inPath.length).every((param) => param.in === 'query'), operation.id);
        }
    });

    it('marks the file answers as text', () => {
        for (const id of ['get_openapi', 'get_llms_txt', 'get_events_ics', 'get_agenda_ics']) assert.equal(OPERATIONS[id].answer, 'text', id);
        assert.equal(OPERATIONS.get_name.answer, 'json');
    });

    it('carries get_key for ud whoami', () => {
        assert.equal(OPERATIONS.get_key.path, '/meta/key');
        assert.equal(OPERATIONS.get_key.tier, 'keyed');
    });

    it('groups every operation under a known tag', () => {
        const tags = new Set(TAGS.map((tag) => tag.id));
        for (const operation of Object.values(OPERATIONS)) assert.ok(tags.has(operation.tag), operation.id);
    });
});

describe('parseRetryAfter', () => {
    const headers = (value) => new Headers(value === undefined ? {} : { 'retry-after': value });
    it('reads seconds, an HTTP date and nothing', () => {
        assert.equal(parseRetryAfter(headers('30')), 30);
        assert.equal(parseRetryAfter(headers(new Date(Date.UTC(2026, 0, 1, 0, 1)).toUTCString()), Date.UTC(2026, 0, 1)), 60);
        assert.equal(parseRetryAfter(headers()), null);
        assert.equal(parseRetryAfter(headers('soon')), null);
    });
});
