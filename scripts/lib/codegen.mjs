/*----------------------------------
- CODEGEN: OPERATIONS AND LISTINGS FROM THE DOCUMENT
----------------------------------*/

/**
 * Pure functions from the OpenAPI document to the SDK's generated tables. They throw on any shape they do not know
 * (a `$ref` they cannot follow, a parameter type outside the four scalars, a nested body), so the nightly contract
 * workflow fails loudly on structural drift instead of generating a table the CLI would misread.
 */

import { METHODS } from './methods.mjs';

/*----------------------------------
- CONSTANTS
----------------------------------*/

const SCALAR_TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const LISTING_TITLE_PREFIX = 'Unique Domains API: ';

/** The ten namespaces of the SDK, in the order the client shows them (plan decision 13). */
export const NAMESPACES = ['names', 'words', 'domains', 'tlds', 'prices', 'market', 'trends', 'agenda', 'editions', 'meta'];

/** A document tag to its namespace. `shared` is split by path; a tag not listed here throws, so a new API fails loudly. */
const NAMESPACE_OF_TAG = { names: 'names', words: 'words', catalog: 'domains', tlds: 'tlds', registrars: 'prices', market: 'market', trends: 'trends', agenda: 'agenda' };

/** The noun the rule strips from an operation id, singular; its plural is stripped too. */
const NOUN_OF_NAMESPACE = { names: 'name', words: 'word', domains: 'domain', tlds: 'tld', prices: 'price', market: 'market', trends: 'trend', agenda: 'agenda', editions: 'edition', meta: 'meta' };

/**
 * The one hand-written piece of the namespaced surface: the ids the rule reads badly, or would make collide
 * (`request_word` and `get_word_request` would both be `words.request`). A test holds it to existing ids.
 */
export const METHOD_OVERRIDES = {
    get_catalog_stats: 'domains.stats',
    get_tld_application_string: 'tlds.application',
    get_word_request: 'words.requestStatus',
};

/*----------------------------------
- HELPERS
----------------------------------*/

const resolveRef = (document, value, seen = new Set()) => {
    if (!value || typeof value.$ref !== 'string') return value;
    // A cycle throws a readable error rather than overflowing the stack (review R1-20).
    if (seen.has(value.$ref)) throw new Error(`Cyclic $ref ${value.$ref}`);
    const match = /^#\/components\/(\w+)\/(.+)$/.exec(value.$ref);
    const target = match ? document.components?.[match[1]]?.[match[2]] : undefined;
    if (!target) throw new Error(`Cannot follow ${value.$ref}`);
    return resolveRef(document, target, new Set([...seen, value.$ref]));
};

/** `null` in an enum is the nullable marker, never a value to pass: dropped for parameters and body alike (R1-20). */
const enumOf = (schema) => schema.enum?.filter((value) => value !== null);

/** `['string', 'null']` reads as `string`: a nullable scalar is still that scalar on the command line. */
const scalarType = (schema, where) => {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter((type) => type !== 'null');
    if (types.length !== 1 || !SCALAR_TYPES.has(types[0])) throw new Error(`${where}: unsupported type ${JSON.stringify(schema.type)}`);
    return types[0];
};

const definedOnly = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

const toParameter = (document, raw, operationId) => {
    const param = resolveRef(document, raw);
    const where = `${operationId}.${param.name}`;
    if (param.in !== 'path' && param.in !== 'query') throw new Error(`${where}: parameters in ${param.in} are not supported`);
    const schema = resolveRef(document, param.schema ?? {});
    return definedOnly({
        name: param.name,
        in: param.in,
        required: Boolean(param.required),
        type: scalarType(schema, where),
        enum: enumOf(schema),
        default: schema.default,
        minimum: schema.minimum,
        maximum: schema.maximum,
        format: schema.format,
        example: param.example,
        description: param.description ?? '',
    });
};

/** Path parameters in the order the path names them, then query parameters in document order (decision 5). */
const orderParameters = (path, parameters) => {
    const pathOrder = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const pathParams = pathOrder.map((name) => {
        const param = parameters.find((entry) => entry.in === 'path' && entry.name === name);
        if (!param) throw new Error(`${path}: no parameter declared for {${name}}`);
        return param;
    });
    return [...pathParams, ...parameters.filter((entry) => entry.in === 'query')];
};

const toBodyProperty = (document, name, raw, required, operationId) => {
    const schema = resolveRef(document, raw);
    const where = `${operationId} body.${name}`;
    if (schema.type === 'array') {
        const items = resolveRef(document, schema.items ?? {});
        return definedOnly({ name, required, type: 'array', items: definedOnly({ type: scalarType(items, where), enum: enumOf(items) }), description: schema.description });
    }
    return definedOnly({ name, required, type: scalarType(schema, where), enum: enumOf(schema), description: schema.description });
};

const toBody = (document, requestBody, operationId) => {
    if (!requestBody) return null;
    const body = resolveRef(document, requestBody);
    const schema = resolveRef(document, body.content?.['application/json']?.schema ?? {});
    if (schema.type !== 'object') throw new Error(`${operationId}: the body is not a JSON object`);
    const required = new Set(schema.required ?? []);
    return {
        required: Boolean(body.required),
        description: body.description ?? '',
        properties: Object.entries(schema.properties ?? {}).map(([name, property]) => toBodyProperty(document, name, property, required.has(name), operationId)),
    };
};

/**
 * `text`: the document, the plain-text and the calendar paths (`/meta/openapi.json`, `/meta/llms.txt`, `.ics`), which
 * answer a file rather than the `{ data, meta, links }` envelope although the document lists a JSON form for them.
 * Decided from the path's extension, the one signal the document gives for all three.
 */
const answerOf = (path) => (/\.(json|txt|ics)$/.test(path) ? 'text' : 'json');

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** The sixteen listing ids, read from the `listing` enum of `get_openapi` (the document's own list). */
export const listingIdsOf = (document) => {
    const operation = document.paths?.['/meta/openapi.json']?.get;
    const listing = operation?.parameters?.map((param) => resolveRef(document, param)).find((param) => param.name === 'listing');
    const ids = listing?.schema?.enum;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('The document lists no listing ids (get_openapi has no `listing` enum)');
    return ids;
};

/** A listing's document reduced to what the SDK reads: its RapidAPI host and the operations it serves. */
export const reduceListing = (id, document) => {
    const operations = [];
    const hosts = new Set();
    for (const item of Object.values(document.paths ?? {})) {
        for (const method of METHODS) {
            const operation = item[method];
            if (!operation?.operationId) continue;
            operations.push(operation.operationId);
            if (operation['x-rapidapi-host']) hosts.add(operation['x-rapidapi-host']);
        }
    }
    if (hosts.size !== 1) throw new Error(`Listing ${id}: expected one RapidAPI host, found ${hosts.size}`);
    const title = String(document.info?.title ?? id);
    return { id, title: title.startsWith(LISTING_TITLE_PREFIX) ? title.slice(LISTING_TITLE_PREFIX.length) : title, host: [...hosts][0], operations };
};

export const buildOperations = (document) => {
    const operations = [];
    const seen = new Set();
    for (const [path, item] of Object.entries(document.paths ?? {})) {
        for (const method of METHODS) {
            const operation = item[method];
            if (!operation) continue;
            const id = operation.operationId;
            if (!id || seen.has(id)) throw new Error(`${method.toUpperCase()} ${path}: missing or repeated operationId`);
            seen.add(id);
            // An operation's parameter overrides the path item's parameter of the same name and location (OpenAPI 3.1).
            const declared = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((param) => toParameter(document, param, id));
            const parameters = declared.filter((param, index) => !declared.slice(index + 1).some((later) => later.in === param.in && later.name === param.name));
            const success = operation.responses?.['200']?.content ?? {};
            operations.push({
                id,
                method: method.toUpperCase(),
                path,
                tag: operation.tags?.[0] ?? 'shared',
                tier: operation['x-tier'] === 'keyed' ? 'keyed' : 'free',
                plan: operation['x-plan'] ?? null,
                metered: operation['x-metered'] ?? null,
                summary: operation.summary ?? '',
                description: operation.description ?? '',
                parameters: orderParameters(path, parameters),
                body: toBody(document, operation.requestBody, id),
                csv: Boolean(success['text/csv']),
                answer: answerOf(path),
                accepted: Boolean(operation.responses?.['202']),
            });
        }
    }
    return operations;
};

/** A tag's title is the part of its description before the first colon (`Domain Check: Any domain name...`). */
const toTag = (tag) => {
    const description = tag.description ?? '';
    const colon = description.indexOf(': ');
    return colon > 0 && colon < 40
        ? { id: tag.name, title: description.slice(0, colon), description: description.slice(colon + 2) }
        : { id: tag.name, title: tag.name.charAt(0).toUpperCase() + tag.name.slice(1), description };
};

// Generated sources are JSON with bare keys where a key is an identifier: readable diffs, no formatter needed.
const toSource = (value) => JSON.stringify(value, null, 4).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, '$1$2:');

const unionOf = (ids) => (ids.length > 0 ? ids.map((id) => `'${id}'`).join(' | ') : 'never');

export const buildOperationsSource = (document, operations) => {
    const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]));
    return [
        "import type { OperationDefinition, TagDefinition } from '../operation';",
        '',
        `/** \`info.version\` of the snapshot. */`,
        `export const API_DOCUMENT_VERSION = ${JSON.stringify(document.info?.version ?? '')};`,
        '',
        `/** The document's first server: the public base every keyless and member call goes to. */`,
        `export const API_PUBLIC_BASE = ${JSON.stringify(document.servers?.[0]?.url ?? '')};`,
        '',
        `/** The document's tags in order: the eight APIs, then \`shared\`. */`,
        `export const TAGS = ${toSource((document.tags ?? []).map(toTag))} as const satisfies readonly TagDefinition[];`,
        '',
        `/** Every operation of the document, keyed by its operation id, in document order. */`,
        `export const OPERATIONS = ${toSource(byId)} as const satisfies Readonly<Record<string, OperationDefinition>>;`,
        '',
        'export type OperationId = keyof typeof OPERATIONS;',
        '',
        '/** The operations that answer a file (the document, plain text, a calendar) instead of the envelope. */',
        `export type TextOperationId = ${unionOf(operations.filter((operation) => operation.answer === 'text').map((operation) => operation.id))};`,
        '',
        '/** The operations with a `.csv` form. */',
        `export type CsvOperationId = ${unionOf(operations.filter((operation) => operation.csv).map((operation) => operation.id))};`,
        '',
    ].join('\n');
};

/*----------------------------------
- NAMESPACED METHODS
----------------------------------*/

const camelCase = (tokens) => tokens.map((token, index) => (index === 0 ? token : token.charAt(0).toUpperCase() + token.slice(1))).join('');

const namespaceOf = (operation) => {
    // The four file answers stay together (plan, lane N1): `await` gives a string there, never a row.
    if (operation.answer === 'text') return 'meta';
    if (operation.tag === 'shared') {
        if (operation.path.startsWith('/editions')) return 'editions';
        if (operation.path.startsWith('/meta')) return 'meta';
        throw new Error(`${operation.id}: no namespace for the shared path ${operation.path}`);
    }
    const namespace = NAMESPACE_OF_TAG[operation.tag];
    if (!namespace) throw new Error(`${operation.id}: no namespace for the tag ${operation.tag}`);
    return namespace;
};

/**
 * Plan decision 13: strip `get_` or `list_` and the namespace's noun, camel-case the rest; a bare `get_<noun>` is
 * `get`, a bare `list_<nouns>` is `list`. Any other verb stays as the name (`batch_names` is `batch`).
 */
export const methodNameOf = (id, namespace) => {
    const tokens = id.split('_');
    const verb = tokens[0] === 'get' || tokens[0] === 'list' ? tokens.shift() : null;
    const noun = NOUN_OF_NAMESPACE[namespace];
    const nounAt = tokens.findIndex((token) => token === noun || token === `${noun}s`);
    if (nounAt >= 0) tokens.splice(nounAt, 1);
    if (tokens.length === 0) {
        if (!verb) throw new Error(`${id}: the rule leaves no method name`);
        return verb;
    }
    return camelCase(tokens);
};

/** One entry per operation, in document order. Throws on an override for an unknown id or a repeated method name. */
export const buildNamespaces = (operations) => {
    const ids = new Set(operations.map((operation) => operation.id));
    for (const id of Object.keys(METHOD_OVERRIDES)) if (!ids.has(id)) throw new Error(`METHOD_OVERRIDES names ${id}, which the document does not list`);
    const seen = new Map();
    return operations.map((operation) => {
        const [namespace, method] = METHOD_OVERRIDES[operation.id]?.split('.') ?? [namespaceOf(operation), null];
        const name = method ?? methodNameOf(operation.id, namespace);
        const where = `${namespace}.${name}`;
        if (seen.has(where)) throw new Error(`${operation.id} and ${seen.get(where)} are both ${where}: add an override`);
        seen.set(where, operation.id);
        const queryKeys = operation.parameters.filter((param) => param.in === 'query').map((param) => param.name);
        // Query keys and body properties share the options object, so one name cannot mean both.
        const clash = operation.body?.properties.find((property) => queryKeys.includes(property.name));
        if (clash) throw new Error(`${operation.id}: ${clash.name} is both a query parameter and a body property`);
        return {
            id: operation.id,
            namespace,
            method: name,
            pathParams: operation.parameters.filter((param) => param.in === 'path').map((param) => param.name),
            queryKeys,
            paged: queryKeys.includes('cursor'),
            optionsRequired: operation.parameters.some((param) => param.in === 'query' && param.required) || Boolean(operation.body?.properties.some((property) => property.required)),
        };
    });
};

/** A value as JavaScript source: single quotes and bare keys, as the README writes them. */
const toLiteral = (value) => {
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (Array.isArray(value)) return `[${value.map(toLiteral).join(', ')}]`;
    if (typeof value === 'object' && value !== null) return `{ ${Object.entries(value).map(([key, entry]) => `${key}: ${toLiteral(entry)}`).join(', ')} }`;
    return String(value);
};

const exampleOf = (param) => {
    const value = param.example ?? `<${param.name}>`;
    return param.type === 'integer' || param.type === 'number' ? Number(value) || 1 : value;
};

/** The options of a method's example: its required query values, then its required body values, cut to two list items. */
const exampleOptions = (document, operation) => {
    const options = {};
    for (const param of operation.parameters) if (param.in === 'query' && param.required) options[param.name] = exampleOf(param);
    const requestBody = operation.body && resolveRef(document, document.paths[operation.path][operation.method.toLowerCase()].requestBody);
    const bodyExample = requestBody?.content?.['application/json']?.example ?? {};
    for (const property of operation.body?.properties ?? []) {
        if (!property.required) continue;
        const value = bodyExample[property.name] ?? (property.type === 'array' ? [`<${property.name}>`] : `<${property.name}>`);
        options[property.name] = Array.isArray(value) ? value.slice(0, 2) : value;
    }
    return options;
};

const methodCallOf = (document, operation, entry) => {
    const args = operation.parameters.filter((param) => param.in === 'path').map((param) => toLiteral(exampleOf(param)));
    const options = exampleOptions(document, operation);
    if (Object.keys(options).length > 0) args.push(toLiteral(options));
    return `ud.${entry.namespace}.${entry.method}(${args.join(', ')})`;
};

const accessLineOf = (operation) => {
    const lines = [];
    if (operation.plan === 'investor') lines.push('Needs a key on the Investor plan.');
    else if (operation.tier === 'keyed') lines.push('Needs a key.');
    if (operation.metered) lines.push(`Spends one ${operation.metered} unit when it runs.`);
    return lines.join(' ');
};

/** The method's JSDoc: the document's summary, what it needs, and an example built from the document's values. */
const jsDocOf = (document, operation, entry, indent) => {
    const call = methodCallOf(document, operation, entry);
    const example = entry.paged ? [`for await (const row of ${call}) console.log(row);`] : [`const answer = await ${call};`];
    const summary = operation.summary.replace(/\s+/g, ' ').replace(/\*\//g, '*\\/').trim();
    const access = accessLineOf(operation);
    const lines = [summary, ...(access ? ['', access] : []), '', '@example', ...example];
    return [`${indent}/**`, ...lines.map((line) => (line ? `${indent} * ${line}` : `${indent} *`)), `${indent} */`].join('\n');
};

const methodSignatureOf = (entry) => {
    const positional = entry.pathParams.map((name) => `${name}: PathParamsOf<'${entry.id}'>['${name}']`);
    const options = `options${entry.optionsRequired ? '' : '?'}: CallOptions<'${entry.id}'>`;
    return `(${[...positional, options].join(', ')}) => OperationCall<'${entry.id}'>`;
};

export const buildNamespacesSource = (document, operations) => {
    const entries = buildNamespaces(operations);
    const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]));
    const inNamespace = (namespace) => entries.filter((entry) => entry.namespace === namespace);
    return [
        "import type { CallOptions, OperationCall } from '../call';",
        "import type { PathParamsOf } from '../types';",
        '',
        '/** Each namespace of the client: a method name to the operation it calls. */',
        `export const NAMESPACE_METHODS = ${toSource(Object.fromEntries(NAMESPACES.map((namespace) => [namespace, Object.fromEntries(inNamespace(namespace).map((entry) => [entry.method, entry.id]))])))} as const;`,
        '',
        '/** The operations a cursor pages through: their call also iterates over rows. */',
        `export type PagedOperationId = ${unionOf(entries.filter((entry) => entry.paged).map((entry) => entry.id))};`,
        '',
        '/** The namespaced methods of a client. */',
        'export type NamespacedClient = {',
        ...NAMESPACES.flatMap((namespace) => [
            `    ${namespace}: {`,
            ...inNamespace(namespace).flatMap((entry) => [jsDocOf(document, byId[entry.id], entry, '        '), `        ${entry.method}: ${methodSignatureOf(entry)};`]),
            '    };',
        ]),
        '};',
        '',
    ].join('\n');
};

export const buildListingsSource = (listings) => [
    "import type { ListingDefinition } from '../listing';",
    '',
    '/** The sixteen RapidAPI listings: the eight APIs, then the eight focused ones, each with its host and operations. */',
    `export const LISTINGS = ${toSource(listings)} as const satisfies readonly ListingDefinition[];`,
    '',
    "export type ListingId = (typeof LISTINGS)[number]['id'];",
    '',
].join('\n');
