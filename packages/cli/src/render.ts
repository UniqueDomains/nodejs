/*----------------------------------
- RENDER: TABLES FOR A TERMINAL
----------------------------------*/

/**
 * Turns an answer's `data` into plain-text tables. A list of rows is one table, columns from the rows' keys with nested
 * objects flattened to dotted columns (`price.firstYear`); an object is a key and value table, and each of its lists of
 * rows follows as a table of its own under the key's name. Cells are cut at 40 characters and columns that do not fit
 * the terminal are left out with a line saying so: `--json` or `--fields` shows everything.
 */

import type { JsonValue } from '@uniquedomains/sdk';

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

const isObject = (value: JsonValue | undefined): value is { readonly [key: string]: JsonValue | undefined } => typeof value === 'object' && value !== null && !Array.isArray(value);

const isRowList = (value: JsonValue | undefined): value is readonly JsonValue[] => Array.isArray(value) && value.length > 0 && value.every((item) => isObject(item));

export const formatCell = (value: JsonValue | undefined): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.every((item) => !isObject(item) && !Array.isArray(item)) ? value.map(formatCell).join(', ') : `${value.length} rows`;
    return JSON.stringify(value);
};

const flatten = (value: { readonly [key: string]: JsonValue | undefined }, prefix = '', depth = 1, out: Row = {}): Row => {
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

const drawTable = (columns: readonly string[], rows: readonly Row[], width: number): string[] => {
    const widths: Record<string, number> = {};
    for (const column of columns) widths[column] = Math.max(column.length, ...rows.map((row) => cut(row[column] ?? '').length));
    const kept = fitColumns(columns, widths, width);
    const line = (cells: Row): string => kept.map((column) => cut(cells[column] ?? '').padEnd(widths[column] ?? 0)).join(GAP).trimEnd();
    const lines = [line(Object.fromEntries(kept.map((column) => [column, column]))), ...rows.map(line)];
    const hidden = columns.length - kept.length;
    if (hidden > 0) lines.push(`(${hidden} more ${hidden === 1 ? 'column' : 'columns'}: use --json, or --fields to choose)`);
    return lines;
};

const rowsTable = (items: readonly JsonValue[], width: number): string[] => {
    const rows = items.map((item) => (isObject(item) ? flatten(item) : { value: formatCell(item) }));
    const columns: string[] = [];
    for (const row of rows) for (const column of Object.keys(row)) if (!columns.includes(column)) columns.push(column);
    return drawTable(columns, rows, width);
};

const objectTable = (value: { readonly [key: string]: JsonValue | undefined }, width: number): string[] => {
    const pairs: Row[] = [];
    const lists: [string, readonly JsonValue[]][] = [];
    for (const [key, item] of Object.entries(value)) {
        if (isRowList(item)) lists.push([key, item]);
        else if (isObject(item) && Object.keys(item).length > 0) for (const [column, cell] of Object.entries(flatten(item, `${key}.`, 2))) pairs.push({ field: column, value: cell });
        else pairs.push({ field: key, value: formatCell(item) });
    }
    // A key and value table has no header row: the field names already say what each line is.
    const keyWidth = Math.max(0, ...pairs.map((pair) => (pair.field ?? '').length));
    const lines = pairs.map((pair) => `${(pair.field ?? '').padEnd(keyWidth)}${GAP}${pair.value ?? ''}`.trimEnd());
    for (const [key, items] of lists) lines.push('', `${key} (${items.length})`, ...rowsTable(items, width));
    return lines;
};

/*----------------------------------
- PUBLIC API
----------------------------------*/

export const renderData = (data: JsonValue | undefined, width: number): string => {
    if (Array.isArray(data)) return data.length === 0 ? 'No rows.' : rowsTable(data, width).join('\n');
    if (isObject(data)) return objectTable(data, width).join('\n');
    return formatCell(data);
};
