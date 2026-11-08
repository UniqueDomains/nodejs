/*----------------------------------
- HELP
----------------------------------*/

/**
 * `ud --help` lists the commands grouped by API (the document's tags), each with its operation's summary;
 * `ud <command> --help` shows one command's arguments and flags from the operation's parameters. Both read the
 * generated table only, so the help is always the document's own words.
 */

import { TAGS } from '@uniquedomains/sdk';
import { COMMANDS, SHORTCUTS, type Command, type FlagSpec } from './commands';

/*----------------------------------
- CONSTANTS
----------------------------------*/

const API_PAGE = 'https://unique.domains/api';
const INDENT = '  ';

/*----------------------------------
- HELPERS
----------------------------------*/

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text);

const usageOf = (command: Command): string => {
    const args = command.positionals.map((param) => `<${param.name}>`).join(' ');
    return `ud ${command.name}${args ? ` ${args}` : ''} [flags]`;
};

const accessOf = (command: Command): string => {
    const { tier, plan, metered } = command.operation;
    const parts = [tier === 'keyed' ? 'needs a member key or a paid RapidAPI plan' : 'free, no key needed'];
    if (plan === 'investor' && tier === 'keyed') parts.push('Investor plan');
    if (metered) parts.push(`spends one ${metered} unit`);
    return parts.join('; ');
};

const markOf = (command: Command): string => {
    const { tier, plan } = command.operation;
    if (tier !== 'keyed') return '';
    return plan === 'investor' ? '[key, Investor] ' : '[key] ';
};

const describeFlag = (spec: FlagSpec): string => {
    const value = spec.type === 'boolean' ? '' : spec.type === 'array' ? ' <a,b,...>' : ` <${spec.type === 'string' ? 'text' : spec.type}>`;
    const facts = [
        spec.enum ? `one of: ${spec.enum.join(', ')}` : null,
        spec.default !== undefined ? `default ${String(spec.default)}` : null,
        spec.required ? 'required' : null,
    ].filter(Boolean);
    const description = spec.description.replace(/\s+/g, ' ').trim();
    return `${INDENT}--${spec.flag}${value}\n${INDENT}${INDENT}${description}${facts.length ? `${description ? ' ' : ''}(${facts.join('; ')})` : ''}`;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const GLOBAL_HELP = [
    'Flags for every command',
    `${INDENT}--json               Print the answer as JSON (the default when the output is not a terminal)`,
    `${INDENT}--csv                Print the CSV form, on the commands that have one`,
    `${INDENT}--verbose            Print the request, the status and the quota and rate-limit headers on stderr`,
    `${INDENT}--key <key>          A member key (ud_live_...); default UD_API_KEY`,
    `${INDENT}--rapidapi-key <key> A RapidAPI key; default UD_RAPIDAPI_KEY`,
    `${INDENT}--listing <id>       The RapidAPI listing of that key (names, whois, ...); default UD_RAPIDAPI_LISTING`,
    `${INDENT}--base <url>         Another API base; default UD_API_BASE, else https://api.unique.domains/v1`,
    `${INDENT}--body <json>        The JSON body of a POST command, inline, @file or - for stdin`,
    `${INDENT}--help, -h           This help, or a command's help after its name`,
    `${INDENT}--version, -V        The version of ud`,
].join('\n');

export const renderMainHelp = (columns: number): string => {
    const nameWidth = Math.max(...COMMANDS.map((command) => usageOf(command).length - ' [flags]'.length - 3), ...SHORTCUTS.map((shortcut) => shortcut.name.length)) + 2;
    const line = (label: string, text: string): string => `${INDENT}${INDENT}${label.padEnd(nameWidth)}${truncate(text, Math.max(20, columns - nameWidth - 4))}`;
    const groups = TAGS.map((tag) => {
        const commands = COMMANDS.filter((command) => command.operation.tag === tag.id);
        if (commands.length === 0) return '';
        return [`${INDENT}${tag.title}`, ...commands.map((command) => line(usageOf(command).slice(3, -' [flags]'.length), `${markOf(command)}${command.operation.summary}`))].join('\n');
    }).filter(Boolean);
    return [
        'ud: the Unique Domains API from the command line.',
        '',
        'Usage',
        `${INDENT}ud <command> [arguments] [flags]`,
        `${INDENT}ud <command> --help`,
        '',
        'Commands by API ([key]: needs a member key or a paid RapidAPI plan)',
        ...groups,
        `${INDENT}Shortcuts`,
        ...SHORTCUTS.map((shortcut) => line(shortcut.name, shortcut.description)),
        '',
        GLOBAL_HELP,
        '',
        'Every command is an operation of the API, its id in kebab case: get_name is ud get-name.',
        `Reference: ${API_PAGE}`,
        '',
    ].join('\n');
};

export const renderCommandHelp = (command: Command): string => {
    const { operation } = command;
    const sections = [
        `Usage: ${usageOf(command)}`,
        '',
        operation.summary,
        ...(operation.description ? ['', operation.description] : []),
        '',
        `${operation.method} ${operation.path}  (${accessOf(command)})`,
    ];
    if (command.positionals.length > 0) {
        sections.push('', 'Arguments', ...command.positionals.map((param) => `${INDENT}<${param.name}>${param.example !== undefined ? `  e.g. ${String(param.example)}` : ''}\n${INDENT}${INDENT}${param.description.replace(/\s+/g, ' ').trim()}`));
    }
    if (command.flags.length > 0) sections.push('', 'Flags', ...command.flags.map(describeFlag));
    if (operation.csv) sections.push('', 'CSV: add --csv for the CSV form.');
    sections.push('', GLOBAL_HELP, '', `Reference: ${API_PAGE}/${operation.id.replace(/_/g, '-')}`, '');
    return sections.join('\n');
};
