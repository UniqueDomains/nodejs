#!/usr/bin/env node
/*----------------------------------
- LIST THE PACKAGES, THE SDK FIRST
----------------------------------*/

/**
 * Prints each workspace's folder name, one a line, in the root `package.json`'s order: the SDK first, since the rest
 * depend on it. The release publishes in this order.
 *
 * Usage: node scripts/list-packages.mjs
 */

import { packageFolders } from './lib/packages.mjs';

console.log(packageFolders().join('\n'));
