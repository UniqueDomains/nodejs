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

/** The version a new package's placeholder takes: below any real one, so the tag's version becomes `latest`. */
export const PLACEHOLDER_VERSION = '0.0.1';

/** A package's identity and nothing that runs: no bin, no dependency, no script, no entry point. */
export const placeholderManifest = (manifest) => ({
    name: manifest.name,
    version: PLACEHOLDER_VERSION,
    description: `Placeholder for ${manifest.name}: the package arrives with its next version.`,
    license: manifest.license,
    author: manifest.author,
    homepage: manifest.homepage,
    repository: manifest.repository,
    bugs: manifest.bugs,
    publishConfig: { access: 'public' },
});

export const placeholderReadme = (manifest) => `# ${manifest.name}\n\nThis version holds no code: it reserves the name until the package's first release. Install a later version. The source is at https://github.com/UniqueDomains/nodejs.\n`;
