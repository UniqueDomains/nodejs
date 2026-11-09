/*----------------------------------
- BIN: WHAT THE USE-CASE COMMANDS SHARE
----------------------------------*/

/**
 * Bundled into each use-case package's bin. A command says what its arguments mean; this file parses them, builds the
 * connection from flags and environment, calls, and prints: a table on a terminal, JSON in a pipe, as `ud` does, with
 * `--json` and `--no-json` to choose. Exit codes as `ud`: 0 on an answer, 1 on a problem from the API or a network
 * failure, 2 on a usage error (no call made). JSON is the answer's `data`, so `| jq .registrar` reads the record itself;
 * the whole envelope is one `ud` command away.
 */

import { ApiProblemError, isListingId, LISTINGS, ListingMismatchError, type ApiCall, type ClientOptions, type JsonValue, type ListingId } from '@uniquedomains/sdk';
import { renderData } from '../../packages/cli/src/render';

/*----------------------------------
- TYPES
----------------------------------*/

export type BinFlag = {
    name: string;
    /** The value's placeholder, for a flag that takes one. */
    value?: string;
    help: string;
};

export type BinArgs = {
    positionals: readonly string[];
    /** The command's own flags: `true` or the value given. */
    flags: Readonly<Record<string, string | true | undefined>>;
};

/** What a command calls: the answer's facts (`withMeta`) are all this file reads, so any call fits. */
type AnyCall = ApiCall<unknown, unknown>;

export type BinAction = {
    call: AnyCall;
    /** A sentence to print on a terminal instead of an empty table. */
    empty?: (data: never) => string | null;
    /** The `ud` command that reads the next page; `--cursor <cursor>` is added after it. */
    nextPage?: string;
};

export type BinSpec = {
    bin: string;
    version: string;
    summary: string;
    usage: readonly string[];
    flags: readonly BinFlag[];
    /** The RapidAPI listing a `--rapidapi-key` belongs to, unless `--listing` names another. */
    listing: ListingId;
    /** Throws `UsageError` on arguments that cannot make a call. */
    plan: (args: BinArgs, connection: ClientOptions) => BinAction;
};

export type Io = {
    stdout: { write: (text: string) => unknown };
    stderr: { write: (text: string) => unknown };
    env: Readonly<Record<string, string | undefined>>;
    isTTY: boolean;
    columns: number;
};

export class UsageError extends Error {
    override readonly name = 'UsageError';
}

type Parsed = BinArgs & {
    json: boolean | null;
    help: boolean;
    version: boolean;
    key?: string;
    rapidapiKey?: string;
    listing?: string;
    base?: string;
};

/*----------------------------------
- CONSTANTS
----------------------------------*/

const CONNECTION_FLAGS: readonly BinFlag[] = [
    { name: 'key', value: '<key>', help: 'A member key. Defaults to UD_API_KEY.' },
    { name: 'rapidapi-key', value: '<key>', help: 'A RapidAPI key. Defaults to UD_RAPIDAPI_KEY.' },
    { name: 'listing', value: '<id>', help: 'The RapidAPI listing the key subscribes to.' },
    { name: 'base', value: '<url>', help: 'Another base URL (a local run). Defaults to UD_API_BASE.' },
    { name: 'json', help: 'Print JSON. The default in a pipe; --no-json prints a table there.' },
    { name: 'help', help: 'This help.' },
    { name: 'version', help: 'The version.' },
];

const SHORT_FLAGS: Readonly<Record<string, string>> = { '-h': '--help', '-V': '--version' };

/*----------------------------------
- HELPERS
----------------------------------*/

const line = (text: string): string => (text.endsWith('\n') ? text : `${text}\n`);

const nonEmpty = (value: string | undefined): string | undefined => (value && value.trim() ? value.trim() : undefined);

const readBoolean = (flag: string, value: string | undefined): boolean => {
    if (value === undefined || value === 'true') return true;
    if (value === 'false') return false;
    throw new UsageError(`--${flag} takes no value other than true or false.`);
};

export const parseArgs = (argv: readonly string[], own: readonly BinFlag[]): Parsed => {
    const flags = new Map([...own, ...CONNECTION_FLAGS].map((flag) => [flag.name, flag]));
    const parsed: Parsed = { positionals: [], flags: {}, json: null, help: false, version: false };
    const positionals: string[] = [];
    const values: Record<string, string | true | undefined> = {};
    for (let index = 0; index < argv.length; index++) {
        const raw = SHORT_FLAGS[argv[index] ?? ''] ?? argv[index] ?? '';
        if (raw === '--') {
            positionals.push(...argv.slice(index + 1));
            break;
        }
        if (!raw.startsWith('-') || raw === '-') {
            positionals.push(raw);
            continue;
        }
        const [head = '', inline] = raw.startsWith('--') && raw.includes('=') ? [raw.slice(0, raw.indexOf('=')), raw.slice(raw.indexOf('=') + 1)] : [raw, undefined];
        const negated = head.startsWith('--no-') && flags.get(head.slice(5))?.value === undefined && flags.has(head.slice(5));
        const name = negated ? head.slice(5) : head.slice(2);
        const flag = head.startsWith('--') ? flags.get(name) : undefined;
        if (!flag) throw new UsageError(`Unknown flag ${head}.`);
        let value: string | true;
        if (flag.value !== undefined) {
            const next = inline ?? argv[index + 1];
            if (next === undefined || (inline === undefined && next.startsWith('--'))) throw new UsageError(`--${name} takes a value: ${flag.value}.`);
            if (inline === undefined) index++;
            value = next;
        } else {
            if (negated && inline !== undefined) throw new UsageError(`--no-${name} takes no value.`);
            const on = negated ? false : readBoolean(name, inline);
            if (name === 'json') parsed.json = on;
            else if (name === 'help') parsed.help = on;
            else if (name === 'version') parsed.version = on;
            else if (on) values[name] = true;
            else delete values[name];
            continue;
        }
        if (name === 'key') parsed.key = value;
        else if (name === 'rapidapi-key') parsed.rapidapiKey = value;
        else if (name === 'listing') parsed.listing = value;
        else if (name === 'base') parsed.base = value;
        else values[name] = value;
    }
    return { ...parsed, positionals, flags: values };
};

/** A flag beats the environment; two keys from the same place are a usage error, never a silent pick (as `ud`). */
const resolveConnection = (args: Parsed, spec: BinSpec, env: Io['env']): ClientOptions => {
    const memberFlag = nonEmpty(args.key);
    const rapidFlag = nonEmpty(args.rapidapiKey);
    if (memberFlag && rapidFlag) throw new UsageError('Pass either --key or --rapidapi-key, not both.');
    const memberEnv = nonEmpty(env.UD_API_KEY);
    const rapidEnv = nonEmpty(env.UD_RAPIDAPI_KEY);
    if (!memberFlag && !rapidFlag && memberEnv && rapidEnv) throw new UsageError('UD_API_KEY and UD_RAPIDAPI_KEY are both set: pass --key or --rapidapi-key to choose.');
    const rapidKey = rapidFlag ?? (memberFlag ? undefined : rapidEnv);
    const listing = nonEmpty(args.listing) ?? nonEmpty(env.UD_RAPIDAPI_LISTING) ?? spec.listing;
    if (!rapidKey && nonEmpty(args.listing)) throw new UsageError('--listing goes with a RapidAPI key (--rapidapi-key or UD_RAPIDAPI_KEY).');
    if (rapidKey && !isListingId(listing)) throw new UsageError(`Unknown listing "${listing}". Listings: ${LISTINGS.map((entry) => entry.id).join(', ')}.`);
    // A base left set from member work never receives a RapidAPI key, as in `ud`; an explicit --base may.
    const base = nonEmpty(args.base) ?? (rapidKey ? undefined : nonEmpty(env.UD_API_BASE));
    if (base !== undefined && !/^https?:\/\//.test(base)) throw new UsageError(`--base takes an http or https URL, not "${base}".`);
    return {
        ...(rapidKey && isListingId(listing) ? { apiKey: null, rapidApi: { key: rapidKey, listing } } : { apiKey: memberFlag ?? memberEnv ?? null }),
        ...(base ? { baseUrl: base } : {}),
        userAgent: `uniquedomains-${spec.bin}/${spec.version}`,
    };
};

const renderHelp = (spec: BinSpec): string => {
    const flags = [...spec.flags, ...CONNECTION_FLAGS];
    const label = (flag: BinFlag): string => `--${flag.name}${flag.value ? ` ${flag.value}` : ''}`;
    const width = Math.max(...flags.map((flag) => label(flag).length));
    return [
        spec.summary,
        '',
        'Usage:',
        ...spec.usage.map((usage) => `  ${spec.bin} ${usage}`),
        '',
        'Flags:',
        ...flags.map((flag) => `  ${label(flag).padEnd(width)}  ${flag.help}`),
        '',
    ].join('\n');
};

const printProblem = (error: ApiProblemError, io: Io): void => {
    io.stderr.write(line(error.detail));
    if (error.retryAfter !== null && error.status === 429) io.stderr.write(line(`Try again in ${error.retryAfter} seconds.`));
    if (error.product) io.stderr.write(line(`See: ${error.product}`));
};

/** The facts of `withMeta()` this file reads, on every operation's answer. */
type Answer = {
    data: JsonValue;
    meta?: { cursor?: string | null };
    links?: { register?: string | null };
    status?: number;
    location?: string | null;
    retryAfter?: number | null;
};

const printAnswer = (answer: Answer, action: BinAction, asJson: boolean, io: Io): void => {
    if (asJson) {
        io.stdout.write(`${JSON.stringify(answer.data, null, 2)}\n`);
    } else {
        const sentence = action.empty?.(answer.data as never) ?? null;
        io.stdout.write(line(sentence ?? renderData(answer.data, { width: io.columns })));
        if (answer.links?.register) io.stdout.write(line(`\nRegister: ${answer.links.register}`));
    }
    if (answer.meta?.cursor && action.nextPage) io.stderr.write(line(`More rows: npx @uniquedomains/cli ${action.nextPage} --cursor ${answer.meta.cursor}`));
    if (answer.status === 202 && answer.location) io.stderr.write(line(`Accepted: the full answer will be at ${answer.location}${answer.retryAfter ? ` in about ${answer.retryAfter} seconds` : ''}.`));
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const runBin = async (spec: BinSpec, argv: readonly string[], io: Io): Promise<number> => {
    try {
        const args = parseArgs(argv, spec.flags);
        if (args.version) {
            io.stdout.write(`${spec.version}\n`);
            return 0;
        }
        if (argv.length === 0 || args.help) {
            io.stdout.write(renderHelp(spec));
            return 0;
        }
        // The URL parser would resolve these away and call another path; the SDK throws a bare TypeError on them.
        const unusable = args.positionals.find((value) => value === '' || value === '.' || value === '..');
        if (unusable !== undefined) throw new UsageError(`An argument cannot be "${unusable}".`);
        const action = spec.plan(args, resolveConnection(args, spec, io.env));
        const answer = await action.call.withMeta() as Answer;
        printAnswer(answer, action, args.json ?? !io.isTTY, io);
        return 0;
    } catch (error) {
        if (error instanceof UsageError) {
            io.stderr.write(line(`${error.message} Run ${spec.bin} --help.`));
            return 2;
        }
        if (error instanceof ApiProblemError) {
            printProblem(error, io);
            return 1;
        }
        if (error instanceof ListingMismatchError) {
            io.stderr.write(line(error.message));
            return 1;
        }
        // Only fetch's own network failure reads as unreachable; any other TypeError is a defect and keeps its stack.
        if (error instanceof TypeError && error.message === 'fetch failed') {
            const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
            io.stderr.write(line(`Could not reach the API${cause}`));
            return 1;
        }
        throw error;
    }
};

/** What a bin file calls: the process as the `Io`, the exit code, and a closed pipe (`| head`) as a quiet end. */
export const main = (spec: BinSpec): void => {
    process.stdout.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') process.exit(0);
        throw error;
    });
    runBin(spec, process.argv.slice(2), {
        stdout: process.stdout,
        stderr: process.stderr,
        env: process.env,
        isTTY: Boolean(process.stdout.isTTY),
        columns: process.stdout.columns || 100,
    }).then(
        (code) => {
            process.exitCode = code;
        },
        (error: Error) => {
            process.stderr.write(`${error.stack ?? error.message}\n`);
            process.exitCode = 1;
        },
    );
};

/** The one positional a command takes, or the usage error that says so. */
export const onePositional = (args: BinArgs, placeholder: string): string => {
    const [value, ...rest] = args.positionals;
    if (value === undefined || rest.length > 0) throw new UsageError(`Give one ${placeholder}.`);
    return value;
};
