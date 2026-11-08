/*----------------------------------
- ARGUMENTS
----------------------------------*/

/**
 * A small parser of our own instead of `node:util` `parseArgs`: the flags depend on the command (found first), a
 * boolean parameter takes `--flag`, `--no-flag` and `--flag=false`, and `allowNegative` is missing from Node 20's
 * `parseArgs`. Values are checked against the operation's types and enums here, so a typo fails before any call;
 * ranges (`minimum`, `maximum`) are left to the API, whose problem detail names the limit.
 */

import { GLOBAL_BOOLEAN_FLAGS, GLOBAL_STRING_FLAGS, type Command, type FlagSpec } from './commands';
import type { ParameterType } from '@uniquedomains/sdk';

/*----------------------------------
- TYPES
----------------------------------*/

export type GlobalFlags = {
    key?: string;
    rapidapiKey?: string;
    listing?: string;
    base?: string;
    body?: string;
    json: boolean;
    csv: boolean;
    verbose: boolean;
    help: boolean;
    version: boolean;
};

export type ParsedValue = string | number | boolean | (string | number | boolean)[];

export type ParsedArgs = {
    commandName: string | null;
    positionals: string[];
    globals: GlobalFlags;
    /** Query and body values by wire name. */
    query: Record<string, string | number | boolean>;
    body: Record<string, ParsedValue>;
};

export class UsageError extends Error {
    override readonly name = 'UsageError';
}

/*----------------------------------
- CONSTANTS
----------------------------------*/

const STRING_GLOBALS: ReadonlySet<string> = new Set(GLOBAL_STRING_FLAGS);
const BOOLEAN_GLOBALS: ReadonlySet<string> = new Set(GLOBAL_BOOLEAN_FLAGS);
const SHORT_FLAGS: Readonly<Record<string, string>> = { '-h': '--help', '-V': '--version' };

/*----------------------------------
- HELPERS
----------------------------------*/

const setBooleanGlobal = (globals: GlobalFlags, flag: string, value: boolean): void => {
    if (flag === 'json') globals.json = value;
    else if (flag === 'csv') globals.csv = value;
    else if (flag === 'verbose') globals.verbose = value;
    else if (flag === 'help') globals.help = value;
    else if (flag === 'version') globals.version = value;
};

const setStringGlobal = (globals: GlobalFlags, flag: string, value: string): void => {
    if (flag === 'key') globals.key = value;
    else if (flag === 'rapidapi-key') globals.rapidapiKey = value;
    else if (flag === 'listing') globals.listing = value;
    else if (flag === 'base') globals.base = value;
    else if (flag === 'body') globals.body = value;
};

const splitFlag = (token: string): { flag: string; inline: string | undefined } => {
    const body = token.slice(2);
    const equals = body.indexOf('=');
    return equals === -1 ? { flag: body, inline: undefined } : { flag: body.slice(0, equals), inline: body.slice(equals + 1) };
};

const convertScalar = (raw: string, type: ParameterType, label: string): string | number | boolean => {
    if (type === 'integer' || type === 'number') {
        const value = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) throw new UsageError(`${label} takes ${type === 'integer' ? 'a whole number' : 'a number'}, not "${raw}".`);
        return value;
    }
    if (type === 'boolean') {
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        throw new UsageError(`${label} takes true or false, not "${raw}".`);
    }
    return raw;
};

const checkEnum = (value: string | number | boolean, spec: { enum?: readonly (string | number)[] }, label: string): void => {
    if (spec.enum && !spec.enum.some((allowed) => allowed === value)) throw new UsageError(`${label} takes one of: ${spec.enum.join(', ')}.`);
};

const convertFlag = (spec: FlagSpec, raw: string): ParsedValue => {
    const label = `--${spec.flag}`;
    if (spec.type === 'array') {
        const items = raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => convertScalar(item, spec.itemType ?? 'string', label));
        for (const item of items) checkEnum(item, spec, label);
        return items;
    }
    const value = convertScalar(raw, spec.type, label);
    checkEnum(value, spec, label);
    return value;
};

/** The first bare token is the command; a global string flag written without `=` takes the next token. */
const findCommandName = (argv: readonly string[]): string | null => {
    for (let index = 0; index < argv.length; index++) {
        const token = argv[index] ?? '';
        if (token === '--') return argv[index + 1] ?? null;
        if (token.startsWith('-')) {
            const { flag, inline } = token.startsWith('--') ? splitFlag(token) : { flag: '', inline: '' };
            if (STRING_GLOBALS.has(flag) && inline === undefined) index++;
            continue;
        }
        return token;
    }
    return null;
};

const emptyGlobals = (): GlobalFlags => ({ json: false, csv: false, verbose: false, help: false, version: false });

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const parseArgv = (argv: readonly string[], resolve: (name: string) => Command | undefined): ParsedArgs & { command: Command | undefined } => {
    const commandName = findCommandName(argv);
    const command = commandName ? resolve(commandName) : undefined;
    const flags = new Map((command?.flags ?? []).map((spec) => [spec.flag, spec]));
    const parsed: ParsedArgs & { command: Command | undefined } = { commandName, command, positionals: [], globals: emptyGlobals(), query: {}, body: {} };
    let commandSeen = false;
    let flagsDone = false;

    for (let index = 0; index < argv.length; index++) {
        const token = SHORT_FLAGS[argv[index] ?? ''] ?? argv[index] ?? '';
        if (flagsDone || !token.startsWith('--') || token === '--') {
            if (token === '--' && !flagsDone) {
                flagsDone = true;
                continue;
            }
            if (!commandSeen && token === commandName) commandSeen = true;
            else parsed.positionals.push(token);
            continue;
        }
        if (token.startsWith('-') && !token.startsWith('--')) throw new UsageError(`Unknown flag ${token}.`);

        const { flag, inline } = splitFlag(token);
        const takeValue = (): string => {
            if (inline !== undefined) return inline;
            const next = argv[index + 1];
            if (next === undefined || next.startsWith('--')) throw new UsageError(`--${flag} needs a value.`);
            index++;
            return next;
        };

        if (BOOLEAN_GLOBALS.has(flag)) {
            setBooleanGlobal(parsed.globals, flag, inline === undefined ? true : convertScalar(inline, 'boolean', `--${flag}`) === true);
            continue;
        }
        if (STRING_GLOBALS.has(flag)) {
            setStringGlobal(parsed.globals, flag, takeValue());
            continue;
        }

        const negated = flag.startsWith('no-') ? flags.get(flag.slice(3)) : undefined;
        const spec = flags.get(flag) ?? (negated?.type === 'boolean' ? negated : undefined);
        if (!spec) throw new UsageError(command ? `${command.name} does not take --${flag}.` : `Unknown flag --${flag}.`);
        const value = spec.type === 'boolean' && inline === undefined ? spec !== negated : convertFlag(spec, takeValue());
        if (spec.source === 'query') {
            if (Array.isArray(value)) throw new UsageError(`--${spec.flag} takes one value.`);
            parsed.query[spec.name] = value;
        } else {
            const previous = parsed.body[spec.name];
            // A repeated list flag adds to the list: `--names a.io --names b.io` is `--names a.io,b.io`.
            parsed.body[spec.name] = Array.isArray(previous) && Array.isArray(value) ? [...previous, ...value] : value;
        }
    }
    return parsed;
};
