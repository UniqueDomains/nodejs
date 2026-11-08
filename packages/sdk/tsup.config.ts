import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    // No source maps in the package: the output is readable ESM and CJS, and maps would double the install.
    sourcemap: false,
    target: 'node20',
    // The version reaches the default User-Agent without importing package.json at runtime (a JSON import needs an
    // import attribute in ESM and is a second file in the CJS build).
    define: { __SDK_VERSION__: JSON.stringify(version) },
});
