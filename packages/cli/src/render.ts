/*----------------------------------
- RENDER: TABLES FOR A TERMINAL
----------------------------------*/

/**
 * Turns an answer's `data` into plain-text tables. A list of rows is one table, columns from the rows' keys with nested
 * objects flattened to dotted columns (`price.firstYear`); an object is a field and value list, and each list of rows
 * inside it, at any depth, follows as a table of its own under its dotted name. Empty fields are left out of a field
 * and value list with a line counting them. Cells are cut at 40 characters, and columns that do not fit the terminal
 * are left out with a line saying so: `--json` shows everything.
 */

import type { JsonValue } from '@uniquedomains/sdk';

/*----------------------------------
- TYPES
----------------------------------*/

export type RenderOptions = {
    /** The terminal's width. */
    width: number;
    /** The command takes `--fields`, so the "more columns" line may point at it. */
    fieldsFlag?: boolean;
};

/*----------------------------------
- CONSTANTS
----------------------------------*/

const CELL_MAX = 40;
const GAP = '  ';
// Nested objects are flattened two levels deep (`registry.registrar`, `price.firstYear`); deeper ones print as JSON.
const FLATTEN_DEPTH = 2;

/*----------------------------------
- HELPERS
----------------------------------*/

type Row = Record<string, string>;
type JsonRecord = { readonly [key: string]: JsonValue | undefined };

const isObject = (value: JsonValue | undefined): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const isRowList = (value: JsonValue | undefined): value is readonly JsonValue[] => Array.isArray(value) && value.length > 0 && value.every((item) => isObject(item));

const isEmpty = (value: JsonValue | undefined): boolean => value === null || value === undefined || (isObject(value) && Object.keys(value).length === 0);

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export const formatCell = (value: JsonValue | undefined): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.every((item) => !isObject(item) && !Array.isArray(item)) ? value.map(formatCell).join(', ') : plural(value.length, 'row', 'rows');
    return JSON.stringify(value);
};

const flatten = (value: JsonRecord, prefix = '', depth = 1, out: Row = {}): Row => {
    for (const [key, item] of Object.entries(value)) {
        if (isObject(item) && depth < FLATTEN_DEPTH + 1 && Object.keys(item).length > 0) flatten(item, `${prefix}${key}.`, depth + 1, out);
        else out[`${prefix}${key}`] = formatCell(item);
    }
    return out;
};

const cut = (text: string): string => {
    const line = text.replace(/\s+/g, ' ');
    return line.length > CELL_MAX ? `${line.slice(0, CELL_MAX - 1)}…` : line;
};

/** The columns that fit `width`, in order; the first column is always kept. */
const fitColumns = (columns: readonly string[], widths: Readonly<Record<string, number>>, width: number): string[] => {
    const kept: string[] = [];
    let used = 0;
    for (const column of columns) {
        const next = used + (kept.length > 0 ? GAP.length : 0) + (widths[column] ?? 0);
        if (kept.length > 0 && next > width) break;
        kept.push(column);
        used = next;
    }
    return kept;
};

const drawTable = (columns: readonly string[], rows: readonly Row[], options: RenderOptions): string[] => {
    const widths: Record<string, number> = {};
    for (const column of columns) widths[column] = Math.max(column.length, ...rows.map((row) => cut(row[column] ?? '').length));
    const kept = fitColumns(columns, widths, options.width);
    const line = (cells: Row): string => kept.map((column) => cut(cells[column] ?? '').padEnd(widths[column] ?? 0)).join(GAP).trimEnd();
    const lines = [line(Object.fromEntries(kept.map((column) => [column, column]))), ...rows.map(line)];
    const hidden = columns.length - kept.length;
    if (hidden > 0) lines.push(`(${plural(hidden, 'more column', 'more columns')}: use --json${options.fieldsFlag ? ', or --fields to choose' : ''})`);
    return lines;
};

const rowsTable = (items: readonly JsonValue[], options: RenderOptions): string[] => {
    const rows = items.map((item) => (isObject(item) ? flatten(item) : { value: formatCell(item) }));
    const columns: string[] = [];
    for (const row of rows) for (const column of Object.keys(row)) if (!columns.includes(column)) columns.push(column);
    return drawTable(columns, rows, options);
};

/** Splits an object into its field and value pairs and its lists of rows, at any depth (review R1-19). */
const collect = (value: JsonRecord, prefix: string, pairs: [string, JsonValue | undefined][], lists: [string, readonly JsonValue[]][]): void => {
    for (const [key, item] of Object.entries(value)) {
        const name = `${prefix}${key}`;
        if (isRowList(item)) lists.push([name, item]);
        else if (isObject(item) && Object.keys(item).length > 0) collect(item, `${name}.`, pairs, lists);
        else pairs.push([name, item]);
    }
};

const objectTable = (value: JsonRecord, options: RenderOptions): string[] => {
    const pairs: [string, JsonValue | undefined][] = [];
    const lists: [string, readonly JsonValue[]][] = [];
    collect(value, '', pairs, lists);
    // An empty field is left out rather than printed as a bare label (review R1-12); the count says it exists.
    const filled = pairs.filter(([, item]) => !isEmpty(item));
    const keyWidth = Math.max(0, ...filled.map(([field]) => field.length));
    const lines = filled.map(([field, item]) => `${field.padEnd(keyWidth)}${GAP}${cut(formatCell(item))}`.trimEnd());
    const empty = pairs.length - filled.length;
    if (empty > 0) lines.push(`(${plural(empty, 'empty field', 'empty fields')}: use --json to see every field)`);
    for (const [key, items] of lists) lines.push('', `${key} (${items.length})`, ...rowsTable(items, options));
    return lines;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const renderData = (data: JsonValue | undefined, options: RenderOptions): string => {
    if (Array.isArray(data)) return data.length === 0 ? 'No rows.' : rowsTable(data, options).join('\n');
    if (isObject(data)) return Object.keys(data).length === 0 ? 'No data.' : objectTable(data, options).join('\n');
    if (data === null || data === undefined) return 'No data.';
    return formatCell(data);
};
