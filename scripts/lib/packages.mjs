/*----------------------------------
- THE WORKSPACE'S PACKAGES
----------------------------------*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Each package's folder name under `packages/`, in the workspaces' order: the SDK first. */
export const packageFolders = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).workspaces.map((workspace) => workspace.replace(/^packages\//, ''));

export const manifestOf = (folder) => JSON.parse(readFileSync(join(ROOT, 'packages', folder, 'package.json'), 'utf8'));
