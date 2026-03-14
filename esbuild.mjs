import * as esbuild from 'esbuild';
import { cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const copyProtoPlugin = {
    name: 'copy-proto',
    setup(build) {
        build.onEnd(() => {
            cpSync(
                join(__dirname, 'src', 'proto'),
                join(__dirname, 'dist', 'proto'),
                { recursive: true }
            );
            console.log('[esbuild] Copied src/proto/ to dist/proto/');
        });
    }
};

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    plugins: [copyProtoPlugin],
};

async function main() {
    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        console.log('[esbuild] Build complete.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
