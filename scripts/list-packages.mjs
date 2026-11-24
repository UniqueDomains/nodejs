#!/usr/bin/env node
/*----------------------------------
- LIST THE PACKAGES, THE SDK FIRST
----------------------------------*/

/**
 * Prints each workspace's folder name, one a line, in the root `package.json`'s order: the SDK first, since the rest
 * depend on it. The release publishes in this order. With `--with-names`, each line is the folder, a space and the
 * package's name on npm, read from its `package.json` (the SDK's folder `sdk` publishes `domain-name-api`).
 *
 * Usage: node scripts/list-packages.mjs
 *        node scripts/list-packages.mjs --with-names
 */

import { packageFolders, workspacePackages } from './lib/packages.mjs';

const unknown = process.argv.slice(2).filter((arg) => arg !== '--with-names');
if (unknown.length > 0) throw new Error(`Unknown option ${unknown.join(' ')}. Usage: list-packages.mjs [--with-names]`);

console.log(process.argv.includes('--with-names') ? workspacePackages().map(({ folder, name }) => `${folder} ${name}`).join('\n') : packageFolders().join('\n'));
