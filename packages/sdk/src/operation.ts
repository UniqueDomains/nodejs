/*----------------------------------
- OPERATION TABLE: TYPES
----------------------------------*/

/**
 * The shape of `generated/operations.ts`, one entry per operation of the document. The CLI builds its commands from
 * it and the MCP server its tools, so a field added here is a contract change for both.
 */

export type ParameterType = 'string' | 'integer' | 'number' | 'boolean';

export type OperationParameter = {
    readonly name: string;
    readonly in: 'path' | 'query';
    readonly required: boolean;
    readonly type: ParameterType;
    readonly enum?: readonly (string | number)[];
    readonly default?: string | number | boolean;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly format?: string;
    readonly example?: string | number | boolean;
    readonly description: string;
};

export type BodyProperty = {
    readonly name: string;
    readonly required: boolean;
    readonly type: ParameterType | 'array';
    readonly items?: { readonly type: ParameterType; readonly enum?: readonly (string | number)[] };
    readonly enum?: readonly (string | number)[];
    readonly description?: string;
};

export type OperationDefinition = {
    readonly id: string;
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly path: string;
    /** The API it belongs to (`names`, `words`, ...), or `shared` for `/meta` and `/editions`. */
    readonly tag: string;
    /** `free` answers without a key (each grade its own fields); `keyed` needs a member key or a paid RapidAPI plan. */
    readonly tier: 'free' | 'keyed';
    /** `investor` when only the Investor plan opens it. */
    readonly plan: string | null;
    /** The metered unit a call spends (`Live`, `Appraisal`, `Intake`), or null. */
    readonly metered: string | null;
    readonly summary: string;
    readonly description: string;
    /** Path parameters in path order, then query parameters in document order. */
    readonly parameters: readonly OperationParameter[];
    readonly body: { readonly required: boolean; readonly description: string; readonly properties: readonly BodyProperty[] } | null;
    /** The operation has a `.csv` form (the same path with `.csv` appended). */
    readonly csv: boolean;
    /** `json` answers the `{ data, meta, links }` envelope; `text` answers a file (the document, plain text, a calendar). */
    readonly answer: 'json' | 'text';
    /** The operation may answer 202 with `Location` and `Retry-After` while the scanner works. */
    readonly accepted: boolean;
};

export type TagDefinition = {
    readonly id: string;
    readonly title: string;
    readonly description: string;
};
