/*----------------------------------
- RUN: ONE INVOCATION OF ud
----------------------------------*/

/**
 * `run(argv, io)` is the whole CLI behind an injectable `io`, so the tests drive it without a process: parse, build
 * the client from flags and environment, call, print. Exit codes: 0 on an answer, 1 on a problem from the API (its
 * `detail` on stderr), a listing mismatch or a network failure, 2 on a usage error.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ApiProblemError, createClient, isListingId, LISTINGS, ListingMismatchError, type ClientOptions, type JsonObject, type JsonValue, type OperationId } from '@uniquedomains/sdk';
import { parseArgv, UsageError, type ParsedArgs } from './argv';
import { findCommand, SHORTCUTS, suggestCommands, type Command } from './commands';
import { renderCommandHelp, renderMainHelp } from './help';
import { renderData } from './render';

/*----------------------------------
- TYPES
----------------------------------*/

export type Io = {
    stdout: { write: (text: string) => unknown };
    stderr: { write: (text: string) => unknown };
    env: Readonly<Record<string, string | undefined>>;
    /** stdout is a terminal: tables by default, JSON otherwise. */
    isTTY: boolean;
    /** The terminal's width, for tables and the help. */
    columns: number;
    fetch?: typeof fetch;
    readStdin?: () => Promise<string>;
};

type Envelope = { data?: JsonValue; meta?: { cursor?: string | null } & Record<string, JsonValue | undefined>; links?: Record<string, string | null | undefined> };

/*----------------------------------
- CONSTANTS
----------------------------------*/

declare const __CLI_VERSION__: string;
export const CLI_VERSION: string = typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : '0.0.0-dev';

// The longest whoami label ("Word intakes") plus two spaces (review finding 8).
const WHOAMI_LABEL_WIDTH = 14;
const label = (name: string, value: string): string => `${name.padEnd(WHOAMI_LABEL_WIDTH)}${value}`;

const VERBOSE_HEADER = /^(x-quota-|x-ratelimit-|retry-after$|location$)/i;

/*----------------------------------
- HELPERS: CLIENT
----------------------------------*/

const isJsonObject = (value: JsonValue | undefined): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: string | undefined): string | undefined => (value && value.trim() ? value.trim() : undefined);

/**
 * Which key to use. A flag beats the environment; a RapidAPI key passed as a flag beats a member key from the
 * environment (the caller asked for RapidAPI on purpose); two keys from the same place are a usage error, never a
 * silent pick.
 */
const resolveKeys = (args: ParsedArgs, env: Io['env']): Pick<ClientOptions, 'apiKey' | 'rapidApi'> => {
    const memberFlag = nonEmpty(args.globals.key);
    const rapidFlag = nonEmpty(args.globals.rapidapiKey);
    if (memberFlag && rapidFlag) throw new UsageError('Pass either --key or --rapidapi-key, not both.');
    const memberEnv = nonEmpty(env.UD_API_KEY);
    const rapidEnv = nonEmpty(env.UD_RAPIDAPI_KEY);
    if (!memberFlag && !rapidFlag && memberEnv && rapidEnv) throw new UsageError('UD_API_KEY and UD_RAPIDAPI_KEY are both set: pass --key or --rapidapi-key to choose.');

    const rapidKey = rapidFlag ?? (memberFlag ? undefined : rapidEnv);
    const listing = nonEmpty(args.globals.listing) ?? nonEmpty(env.UD_RAPIDAPI_LISTING);
    if (rapidKey) {
        if (!listing) throw new UsageError(`A RapidAPI key needs its listing: --listing ${LISTINGS.map((entry) => entry.id).join('|')}.`);
        if (!isListingId(listing)) throw new UsageError(`Unknown listing "${listing}". Listings: ${LISTINGS.map((entry) => entry.id).join(', ')}.`);
        return { apiKey: null, rapidApi: { key: rapidKey, listing } };
    }
    if (nonEmpty(args.globals.listing)) throw new UsageError('--listing goes with a RapidAPI key (--rapidapi-key or UD_RAPIDAPI_KEY).');
    return { apiKey: memberFlag ?? memberEnv ?? null };
};

/** `--verbose`: the request line, the status and the quota and rate-limit headers, on stderr. Never a key. */
const verboseFetch = (base: typeof fetch, io: Io): typeof fetch => async (input, init) => {
    const request = new Request(input, init);
    io.stderr.write(`> ${request.method} ${request.url}\n`);
    const response = await base(request);
    io.stderr.write(`< ${response.status} ${response.statusText}\n`);
    response.headers.forEach((value, name) => {
        if (VERBOSE_HEADER.test(name)) io.stderr.write(`< ${name}: ${value}\n`);
    });
    return response;
};

/*----------------------------------
- HELPERS: REQUEST
----------------------------------*/

const readBody = async (raw: string | undefined, io: Io): Promise<JsonObject | undefined> => {
    if (raw === undefined) return undefined;
    const text = raw === '-' ? await (io.readStdin?.() ?? Promise.resolve('')) : raw.startsWith('@') ? await readFile(raw.slice(1), 'utf8') : raw;
    let body: JsonValue;
    try {
        body = JSON.parse(text);
    } catch {
        throw new UsageError('--body is not valid JSON.');
    }
    if (!isJsonObject(body)) throw new UsageError('--body must be a JSON object.');
    return body;
};

const buildParams = async (command: Command, args: ParsedArgs, io: Io) => {
    const expected = command.positionals;
    if (args.positionals.length !== expected.length) {
        const names = expected.map((param) => `<${param.name}>`).join(' ');
        throw new UsageError(expected.length === 0 ? `${command.name} takes no argument.` : `${command.name} takes ${expected.length === 1 ? 'one argument' : `${expected.length} arguments`}: ${names}.`);
    }
    const path = Object.fromEntries(expected.map((param, index) => [param.name, args.positionals[index] ?? '']));
    const operation = command.operation;
    let body: JsonObject | undefined;
    if (operation.body) {
        body = { ...(await readBody(args.globals.body, io)), ...args.body };
        const missing = operation.body.properties.filter((property) => property.required && body?.[property.name] === undefined);
        const flagOf = (name: string): string => command.flags.find((spec) => spec.source === 'body' && spec.name === name)?.flag ?? name;
        if (missing.length > 0) throw new UsageError(`${command.name} needs ${missing.map((property) => `--${flagOf(property.name)}`).join(', ')}.`);
    } else if (args.globals.body !== undefined) {
        throw new UsageError(`${command.name} takes no body.`);
    }
    if (args.globals.csv && !operation.csv) throw new UsageError(`${command.name} has no CSV form.`);
    return { path, query: args.query, ...(body ? { body } : {}), ...(args.globals.csv ? { format: 'csv' as const } : {}) };
};

/*----------------------------------
- HELPERS: OUTPUT
----------------------------------*/

const line = (text: string): string => (text.endsWith('\n') ? text : `${text}\n`);

/** Lines under a table: the register and dataset links (API v2 plan, section 12) and how to read the next page. */
const footer = (command: Command, envelope: Envelope): string[] => {
    const lines: string[] = [];
    if (envelope.links?.register) lines.push(`Register: ${envelope.links.register}`);
    if (envelope.links?.dataset) lines.push(`Dataset: ${envelope.links.dataset}`);
    if (envelope.meta?.cursor) lines.push(`Next page: ud ${command.name} ... --cursor ${envelope.meta.cursor}`);
    return lines;
};

const allowanceLine = (label: string, value: JsonValue | undefined): string | null => {
    if (!isJsonObject(value)) return null;
    const used = typeof value.used === 'number' ? value.used : null;
    const allowance = typeof value.allowance === 'number' ? value.allowance : null;
    if (used === null || allowance === null) return null;
    return `${label.padEnd(WHOAMI_LABEL_WIDTH)}${used} used of ${allowance}, ${Math.max(0, allowance - used)} left`;
};

/** `ud whoami`: the key's plan, month and what is left, as sentences rather than a dump of fields. */
const renderWhoami = (data: JsonValue | undefined): string => {
    if (!isJsonObject(data)) return renderData(data, 80);
    const text = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : '');
    const lines = data.access === 'rapidapi'
        ? [label('Access', 'RapidAPI'), label('Listing', text(data.listing)), label('Plan', text(data.subscription))]
        : [label('Access', `member key ${text(data.keyPrefix)}`), label('Plan', text(data.plan)), label('Month', `${text(data.month)}, resets on ${text(data.resetsOn)}`)];
    for (const [label, key] of [['Calls', 'calls'], ['Live checks', 'liveChecks'], ['Appraisals', 'appraisals'], ['Word intakes', 'intakes']] as const) {
        const entry = allowanceLine(label, data[key]);
        if (entry) lines.push(entry);
    }
    if (typeof data.investorEndpoints === 'boolean') lines.push(label('Investor', data.investorEndpoints ? 'open' : 'not on this plan'));
    return lines.join('\n');
};

const printProblem = (error: ApiProblemError, io: Io, verbose: boolean): void => {
    io.stderr.write(line(error.detail));
    const suggestion = error.problem.suggestion;
    if (typeof suggestion === 'string' && suggestion) io.stderr.write(line(`Did you mean ${suggestion}?`));
    if (error.retryAfter !== null && error.status === 429) io.stderr.write(line(`Try again in ${error.retryAfter} seconds.`));
    if (error.product) io.stderr.write(line(`See: ${error.product}`));
    if (verbose) io.stderr.write(line(JSON.stringify(error.problem, null, 2)));
};

const snapshotText = async (): Promise<string> => {
    const require = createRequire(import.meta.url);
    return readFile(require.resolve('@uniquedomains/sdk/openapi.json'), 'utf8');
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const run = async (argv: readonly string[], io: Io): Promise<number> => {
    let args: ReturnType<typeof parseArgv>;
    try {
        args = parseArgv(argv, findCommand);
        if (args.globals.version) {
            io.stdout.write(`${CLI_VERSION}\n`);
            return 0;
        }
        if (!args.commandName) {
            io.stdout.write(renderMainHelp(io.columns));
            return argv.length === 0 || args.globals.help ? 0 : 2;
        }
        if (args.commandName === 'openapi') {
            // Help first, so `ud openapi --help` explains the shortcut rather than printing the document (review finding 9).
            if (args.globals.help) {
                io.stdout.write(`Usage: ud openapi\n\n${SHORTCUTS.find((entry) => entry.name === 'openapi')?.description ?? ''}\n`);
                return 0;
            }
            io.stdout.write(await snapshotText());
            return 0;
        }
        if (!args.command) {
            const close = suggestCommands(args.commandName);
            throw new UsageError(`Unknown command "${args.commandName}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''} Run ud --help for the list.`);
        }
        if (args.globals.help) {
            io.stdout.write(renderCommandHelp(args.command));
            return 0;
        }
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        io.stderr.write(line(error.message));
        return 2;
    }

    const command = args.command;
    try {
        const base = nonEmpty(args.globals.base) ?? nonEmpty(io.env.UD_API_BASE);
        const baseFetch = io.fetch ?? globalThis.fetch;
        const client = createClient({
            ...resolveKeys(args, io.env),
            ...(base ? { baseUrl: base } : {}),
            fetch: args.globals.verbose ? verboseFetch(baseFetch, io) : baseFetch,
            userAgent: `uniquedomains-cli/${CLI_VERSION}`,
        });
        const params = await buildParams(command, args, io);
        // `request` is typed per operation; the CLI builds its params from the same table at runtime, so it calls the
        // untyped form through one adapter instead of a cast at every use.
        const answer = await callOperation(client.request, command.operation.id, params);

        if ('text' in answer && typeof answer.text === 'string') {
            io.stdout.write(line(answer.text));
            return 0;
        }
        const envelope: Envelope = { data: answer.data, meta: answer.meta, links: answer.links };
        const asJson = args.globals.json || !io.isTTY;
        if (asJson) {
            io.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
        } else {
            const body = command.operation.id === 'get_key' ? renderWhoami(envelope.data) : renderData(envelope.data, io.columns);
            io.stdout.write(line([body, ...footer(command, envelope).map((entry, index) => (index === 0 ? `\n${entry}` : entry))].join('\n')));
        }
        if (answer.status === 202 && answer.location) io.stderr.write(line(`Accepted: the full answer will be at ${answer.location}${answer.retryAfter !== null ? ` in about ${answer.retryAfter} seconds` : ''}.`));
        return 0;
    } catch (error) {
        if (error instanceof UsageError) {
            io.stderr.write(line(`${error.message} Run ud ${command.name} --help.`));
            return 2;
        }
        if (error instanceof ApiProblemError) {
            printProblem(error, io, args.globals.verbose);
            return 1;
        }
        if (error instanceof ListingMismatchError) {
            io.stderr.write(line(error.message));
            return 1;
        }
        // Only fetch's own network failure ("fetch failed", with its cause) reads as unreachable; any other TypeError
        // is a defect and keeps its stack (review finding 7).
        if (error instanceof TypeError && error.message === 'fetch failed') {
            const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
            io.stderr.write(line(`Could not reach the API${cause}`));
            return 1;
        }
        throw error;
    }
};

/*----------------------------------
- ADAPTER
----------------------------------*/

type UntypedAnswer = {
    status: number;
    text?: string;
    data?: JsonValue;
    meta?: Envelope['meta'];
    links?: Envelope['links'];
    location: string | null;
    retryAfter: number | null;
};

/**
 * The one boundary between the CLI's runtime-built params and the SDK's per-operation types: the operation id and
 * the params both come from the generated table, which is what the types are generated from.
 */
const callOperation = (request: ReturnType<typeof createClient>['request'], operationId: string, params: object): Promise<UntypedAnswer> =>
    (request as unknown as (id: OperationId, params: object) => Promise<UntypedAnswer>)(operationId as OperationId, params);
