/*----------------------------------
- RECORDED NAMES: WHAT NO README MAY PRINT
----------------------------------*/

/**
 * The recorded answers (`test/fixtures/recorded/`) carry real domain names (a catalog row, a name of a drop day, a name
 * at auction) and the auction venues. A README shows calls, never those rows: the day's auction sample and the names of
 * a drop day stay in the answer (AGENTS.md of the platform, "Minimum Data Exposure"; npm unscoped names, lane N, "Side
 * paths"). So `check-text.mjs` refuses a README line that prints one of these names, beside the sample names the READMEs
 * call on purpose, and a line of a market package's README that names a venue.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The sample names the READMEs call on purpose. */
export const README_SAMPLE_NAMES = new Set(['get.plumbing', 'harbor.io']);

/**
 * The READMEs that may not name a venue: those of the packages about the market. Not the others: a registrar that also
 * runs auctions is named there as the registrar of the README's sample name.
 */
export const VENUE_FREE_READMES = new Set(['packages/domain-auctions/README.md', 'packages/domain-sales/README.md', 'packages/expired-domains-api/README.md']);

const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const walk = (value, visit) => {
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
    else if (value && typeof value === 'object') {
        visit(value);
        Object.values(value).forEach((entry) => walk(entry, visit));
    }
};

/** Every domain name a recorded answer carries under `name`, and every venue (its id and its label). */
export const recordedNames = (root) => {
    const dir = join(root, 'test', 'fixtures', 'recorded');
    const names = new Set();
    const venues = new Set();
    if (!existsSync(dir)) return { names, venues };
    for (const file of readdirSync(dir).filter((entry) => entry.endsWith('.json'))) {
        const { response } = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        walk(response?.body, (row) => {
            if (typeof row.name === 'string' && DOMAIN.test(row.name) && !README_SAMPLE_NAMES.has(row.name)) names.add(row.name);
            for (const key of ['venue', 'venueLabel']) if (typeof row[key] === 'string' && row[key]) venues.add(row[key]);
            // A venue's own row (`/market/auctions/venues`): its id and its label.
            if ('closeRule' in row) for (const key of ['id', 'label']) if (typeof row[key] === 'string' && row[key]) venues.add(row[key]);
        });
    }
    return { names, venues };
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The recorded names and venues one line of a README prints. `path` is the README's path from the root. */
export const namesPrinted = (line, path, { names, venues }) => {
    const found = [...names].filter((name) => new RegExp(`(?<![\\w.-])${escape(name)}(?![\\w-])`, 'i').test(line));
    if (VENUE_FREE_READMES.has(path)) found.push(...[...venues].filter((venue) => new RegExp(`\\b${escape(venue)}\\b`, 'i').test(line)));
    return found;
};
