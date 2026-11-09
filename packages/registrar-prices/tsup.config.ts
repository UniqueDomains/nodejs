import { readFileSync } from 'node:fs';
import { defineConfig, type Options } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const shared: Options = {
    format: ['esm', 'cjs'],
    target: 'node20',
    // No source maps in the package: the output is readable, and maps would double the install.
    sourcemap: false,
    define: { __PACKAGE_VERSION__: JSON.stringify(version) },
    // The SDK stays a dependency, never bundled: one copy of the error classes and the operation table per install.
    external: ['@uniquedomains/sdk'],
};

export default defineConfig([
    { ...shared, entry: ['src/index.ts'], dts: true, clean: true },
    // The bin is ESM only (`"type": "module"` makes `dist/bin.js` ESM); the shebang makes it executable.
    { ...shared, entry: ['src/bin.ts'], format: ['esm'], dts: false, clean: false, banner: { js: '#!/usr/bin/env node' } },
]);
