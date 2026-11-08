import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPERATIONS } from '@uniquedomains/sdk';
import { COMMANDS, findCommand, kebab, SHORTCUTS } from '../dist/index.js';

const GLOBALS = new Set(['key', 'rapidapi-key', 'listing', 'base', 'body', 'json', 'csv', 'verbose', 'help', 'version']);

describe('the command table (plan decision 5)', () => {
    it('has one command per operation, named by its id in kebab case', () => {
        assert.equal(COMMANDS.length, Object.keys(OPERATIONS).length);
        for (const operation of Object.values(OPERATIONS)) {
            const command = findCommand(operation.id.replace(/_/g, '-'));
            assert.ok(command, operation.id);
            assert.equal(command.operation.id, operation.id);
        }
        assert.equal(new Set(COMMANDS.map((command) => command.name)).size, COMMANDS.length);
    });

    for (const operation of Object.values(OPERATIONS)) {
        it(`${operation.id}: positionals from the path, flags from the query and the body`, () => {
            const command = findCommand(kebab(operation.id));
            const pathParams = operation.parameters.filter((param) => param.in === 'path').map((param) => param.name);
            assert.deepEqual(command.positionals.map((param) => param.name), pathParams);
            assert.deepEqual(pathParams, [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
            const expected = [
                ...operation.parameters.filter((param) => param.in === 'query').map((param) => param.name),
                ...(operation.body?.properties ?? []).map((property) => property.name),
            ];
            assert.deepEqual(command.flags.map((spec) => spec.name), expected);
            for (const spec of command.flags) {
                assert.ok(!GLOBALS.has(spec.flag), `${operation.id} --${spec.flag} takes a global flag's name`);
                const bare = kebab(spec.name);
                assert.equal(spec.flag, GLOBALS.has(bare) ? `param-${bare}` : bare);
            }
            assert.equal(new Set(command.flags.map((spec) => spec.flag)).size, command.flags.length, 'flags are unique');
        });
    }

    it('kebab-cases ids and camelCase names', () => {
        assert.equal(kebab('get_name_registry_history'), 'get-name-registry-history');
        assert.equal(kebab('publicSet'), 'public-set');
        assert.equal(kebab('nameOrId'), 'name-or-id');
        assert.equal(kebab('q'), 'q');
    });

    it('prefixes the query parameter named listing', () => {
        assert.ok(findCommand('get-meta-tlds').flags.some((spec) => spec.flag === 'param-listing' && spec.name === 'listing'));
    });

    it('maps the shortcuts', () => {
        assert.equal(findCommand('whoami').operation.id, 'get_key');
        assert.equal(findCommand('enums').operation.id, 'get_meta_enums');
        assert.ok(SHORTCUTS.some((shortcut) => shortcut.name === 'openapi' && shortcut.target === null));
    });
});
