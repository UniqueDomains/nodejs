#!/usr/bin/env node
/*----------------------------------
- COPY ASSETS INTO A PACKAGE BEFORE ITS BUILD
----------------------------------*/

/**
 * `npm publish` packs a workspace package's own folder only, so the root `LICENSE` is copied into each package, and
 * the SDK also gets the snapshot as `openapi.json` (exported as `@uniquedomains/sdk/openapi.json`: the CLI's
 * `ud openapi` prints it and the MCP server generates its tools from it). Both copies are git-ignored: the root files
 * stay the only sources.
 *
 * Usage: node scripts/copy-assets.mjs <package folder>
 */

import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const packageDir = target ? join(ROOT, 'packages', target) : '';
if (!target || !existsSync(join(packageDir, 'package.json'))) throw new Error('Usage: copy-assets.mjs <package folder>');
await copyFile(join(ROOT, 'LICENSE'), join(packageDir, 'LICENSE'));
if (target === 'sdk') await copyFile(join(ROOT, 'openapi', 'v1.json'), join(packageDir, 'openapi.json'));
