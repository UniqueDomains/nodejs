/*----------------------------------
- CODEGEN: OPERATIONS AND LISTINGS FROM THE DOCUMENT
----------------------------------*/

/**
 * Pure functions from the OpenAPI document to the SDK's generated tables. They throw on any shape they do not know
 * (a `$ref` they cannot follow, a parameter type outside the four scalars, a nested body), so the nightly contract
 * workflow fails loudly on structural drift instead of generating a table the CLI would misread.
 */

/*----------------------------------
- CONSTANTS
----------------------------------*/

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const SCALAR_TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const LISTING_TITLE_PREFIX = 'Unique Domains API: ';

/*----------------------------------
- HELPERS
----------------------------------*/

const resolveRef = (document, value) => {
    if (!value || typeof value.$ref !== 'string') return value;
    const match = /^#\/components\/(\w+)\/(.+)$/.exec(value.$ref);
    const target = match ? document.components?.[match[1]]?.[match[2]] : undefined;
    if (!target) throw new Error(`Cannot follow ${value.$ref}`);
    return resolveRef(document, target);
};

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
        enum: schema.enum?.filter((value) => value !== null),
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
        return definedOnly({ name, required, type: 'array', items: definedOnly({ type: scalarType(items, where), enum: items.enum }), description: schema.description });
    }
    return definedOnly({ name, required, type: scalarType(schema, where), enum: schema.enum, description: schema.description });
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
            const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((param) => toParameter(document, param, id));
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

export const buildListingsSource = (listings) => [
    "import type { ListingDefinition } from '../listing';",
    '',
    '/** The sixteen RapidAPI listings: the eight APIs, then the eight focused ones, each with its host and operations. */',
    `export const LISTINGS = ${toSource(listings)} as const satisfies readonly ListingDefinition[];`,
    '',
    "export type ListingId = (typeof LISTINGS)[number]['id'];",
    '',
].join('\n');
