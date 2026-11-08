/*----------------------------------
- COMMANDS: ONE PER OPERATION
----------------------------------*/

/**
 * The command grammar of plan decision 5: the operation id in kebab case (`get_name` is `ud get-name`), path
 * parameters as positional arguments in path order, query parameters as flags in kebab case (`publicSet` is
 * `--public-set`), and a POST body's properties as flags too (`--names a.io,b.io`). Generated from the SDK's
 * operation table, so a regenerated snapshot adds its commands with no change here.
 */

import { OPERATIONS, type BodyProperty, type OperationDefinition, type OperationParameter, type ParameterType } from '@uniquedomains/sdk';

/*----------------------------------
- TYPES
----------------------------------*/

export type FlagSpec = {
    /** The flag without its dashes (`public-set`). */
    flag: string;
    /** Where the value goes: a query parameter, or a property of the JSON body. */
    source: 'query' | 'body';
    /** The parameter or property name on the wire (`publicSet`). */
    name: string;
    type: ParameterType | 'array';
    itemType?: ParameterType;
    enum?: readonly (string | number)[];
    required: boolean;
    description: string;
    default?: string | number | boolean;
};

export type Command = {
    name: string;
    operation: OperationDefinition;
    /** The path parameters, in path order. */
    positionals: readonly OperationParameter[];
    flags: readonly FlagSpec[];
};

export type Shortcut = {
    name: string;
    description: string;
    /** The command it runs, or null for `openapi` (prints the committed snapshot, no call). */
    target: string | null;
};

/*----------------------------------
- CONSTANTS
----------------------------------*/

/** Flags every command takes, whatever its operation. */
export const GLOBAL_STRING_FLAGS = ['key', 'rapidapi-key', 'listing', 'base', 'body'] as const;
export const GLOBAL_BOOLEAN_FLAGS = ['json', 'csv', 'verbose', 'help', 'version'] as const;
const RESERVED_FLAGS: ReadonlySet<string> = new Set<string>([...GLOBAL_STRING_FLAGS, ...GLOBAL_BOOLEAN_FLAGS]);

/**
 * A parameter whose flag would take a global flag's name gets the `param-` prefix: `get_meta_tlds` and `get_openapi`
 * take a `listing` query parameter, while `--listing` names the RapidAPI listing of the key (the plan's example
 * `ud --rapidapi-key ... --listing whois ...`). Deterministic, so the rule is the documentation.
 */
const COLLISION_PREFIX = 'param-';

export const SHORTCUTS: readonly Shortcut[] = [
    { name: 'whoami', description: 'Your key: its plan, its month and what is left of it.', target: 'get-key' },
    { name: 'enums', description: 'Every enumerated value the API uses (statuses, kinds, bands).', target: 'get-meta-enums' },
    { name: 'openapi', description: 'Print the OpenAPI document this version was built from.', target: null },
];

/*----------------------------------
- HELPERS
----------------------------------*/

/** `get_name` to `get-name`, `publicSet` to `public-set`, `nameOrId` to `name-or-id`. */
export const kebab = (value: string): string => value.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const flagNameFor = (name: string): string => {
    const flag = kebab(name);
    return RESERVED_FLAGS.has(flag) ? `${COLLISION_PREFIX}${flag}` : flag;
};

const fromQuery = (param: OperationParameter): FlagSpec => ({
    flag: flagNameFor(param.name),
    source: 'query',
    name: param.name,
    type: param.type,
    ...(param.enum ? { enum: param.enum } : {}),
    required: param.required,
    description: param.description,
    ...(param.default !== undefined ? { default: param.default } : {}),
});

const fromBody = (property: BodyProperty): FlagSpec => ({
    flag: flagNameFor(property.name),
    source: 'body',
    name: property.name,
    type: property.type,
    ...(property.items ? { itemType: property.items.type } : {}),
    ...((property.items?.enum ?? property.enum) ? { enum: property.items?.enum ?? property.enum } : {}),
    // A required body property is required on the command line unless `--body` carries the whole body.
    required: property.required,
    description: property.description ?? (property.type === 'array' ? 'A comma-separated list.' : ''),
});

const toCommand = (operation: OperationDefinition): Command => ({
    name: kebab(operation.id),
    operation,
    positionals: operation.parameters.filter((param) => param.in === 'path'),
    flags: [
        ...operation.parameters.filter((param) => param.in === 'query').map(fromQuery),
        ...(operation.body?.properties ?? []).map(fromBody),
    ],
});

/*----------------------------------
- PUBLIC API
----------------------------------*/

/** Every command, in document order. */
export const COMMANDS: readonly Command[] = Object.values<OperationDefinition>(OPERATIONS).map(toCommand);

export const findCommand = (name: string): Command | undefined => {
    const shortcut = SHORTCUTS.find((entry) => entry.name === name);
    const target = shortcut ? shortcut.target : name;
    return target ? COMMANDS.find((command) => command.name === target) : undefined;
};

/** The closest command names, for "did you mean" on a typo. */
export const suggestCommands = (name: string): readonly string[] => {
    const names = [...COMMANDS.map((command) => command.name), ...SHORTCUTS.map((shortcut) => shortcut.name)];
    const parts = name.split('-').filter((part) => part.length > 2);
    return names.filter((candidate) => candidate.includes(name) || parts.some((part) => candidate.includes(part))).slice(0, 5);
};
