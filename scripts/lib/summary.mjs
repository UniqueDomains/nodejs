/*----------------------------------
- SUMMARY: WHAT CHANGED BETWEEN TWO SNAPSHOTS
----------------------------------*/

/**
 * The change summary printed by `npm run generate` and used as the body of the contract workflow's pull request:
 * operations added, removed and changed, the shared components, and the listings' hosts and operation sets.
 */

import { METHODS } from './methods.mjs';

/** Each operation with what defines it: its own object and the path item's parameters (review R1-14). */
const operationsOf = (document) => {
    const operations = new Map();
    for (const [path, item] of Object.entries(document?.paths ?? {})) {
        for (const method of METHODS) {
            if (item[method]?.operationId) operations.set(item[method].operationId, { label: `${method.toUpperCase()} ${path}`, body: JSON.stringify([item.parameters ?? null, item[method]]) });
        }
    }
    return operations;
};

const compareListings = (previous, next) => {
    const lines = [];
    const before = new Map((previous ?? []).map((listing) => [listing.id, listing]));
    for (const listing of next) {
        const old = before.get(listing.id);
        if (!old) lines.push(`listing ${listing.id}: new (${listing.host})`);
        else if (JSON.stringify(old) !== JSON.stringify(listing)) {
            const added = listing.operations.filter((id) => !old.operations.includes(id));
            const removed = old.operations.filter((id) => !listing.operations.includes(id));
            const parts = [
                old.host !== listing.host ? `host ${old.host} to ${listing.host}` : null,
                old.title !== listing.title ? `title "${listing.title}"` : null,
                added.length ? `adds ${added.join(', ')}` : null,
                removed.length ? `drops ${removed.join(', ')}` : null,
            ].filter(Boolean);
            lines.push(`listing ${listing.id}: ${parts.join('; ') || 'reordered'}`);
        }
        before.delete(listing.id);
    }
    for (const id of before.keys()) lines.push(`listing ${id}: removed`);
    return lines;
};

export const summarizeChanges = (previous, next) => {
    const lines = [];
    const prevDocument = previous?.document;
    if (prevDocument?.info?.version !== next.document.info?.version) lines.push(`document version ${prevDocument?.info?.version ?? 'none'} to ${next.document.info?.version}`);
    const before = operationsOf(prevDocument);
    const after = operationsOf(next.document);
    for (const [id, operation] of after) {
        if (!before.has(id)) lines.push(`added ${id} (${operation.label})`);
        else if (before.get(id).body !== operation.body) lines.push(`changed ${id} (${operation.label})`);
    }
    for (const [id, operation] of before) if (!after.has(id)) lines.push(`removed ${id} (${operation.label})`);
    if (JSON.stringify(prevDocument?.components) !== JSON.stringify(next.document.components)) lines.push('changed the shared components (Problem, Meta, Links, security)');
    // `servers[0].url` becomes API_PUBLIC_BASE and the tags group the CLI's help: both are worth a line of their own.
    if (JSON.stringify(prevDocument?.servers) !== JSON.stringify(next.document.servers)) lines.push(`changed the servers (${(next.document.servers ?? []).map((server) => server.url).join(', ')})`);
    if (JSON.stringify(prevDocument?.tags) !== JSON.stringify(next.document.tags)) lines.push('changed the tags (the APIs and their descriptions)');
    lines.push(...compareListings(previous?.listings, next.listings));

    const count = after.size;
    const text = lines.length === 0 ? `No change to the document (${count} operations).` : `${lines.length} changes (${count} operations):\n${lines.map((line) => `  - ${line}`).join('\n')}`;
    const markdown = lines.length === 0
        ? `No change to the document (${count} operations).\n`
        : `The live document at \`/v1/meta/openapi.json\` differs from the committed snapshot (${count} operations).\n\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
    return { text, markdown, changed: lines.length > 0 };
};
