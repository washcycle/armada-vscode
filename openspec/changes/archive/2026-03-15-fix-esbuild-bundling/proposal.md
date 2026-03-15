## Why

The extension is broken when installed from the VS Code Marketplace. The `.vscodeignore` excludes `node_modules/**`, so production dependencies (`@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs`, `js-yaml`) are missing from the VSIX package. Every `require()` call for these modules fails at runtime. The current build is plain `tsc` compilation with no bundling — Microsoft recommends using esbuild to bundle extensions into a single file.

## What Changes

- Add **esbuild** as the bundler, producing a single `dist/extension.js` that includes all production dependencies
- Update **package.json** entry point from `./out/extension.js` to `./dist/extension.js`
- Update **package.json scripts** to use esbuild for `vscode:prepublish` and add a watch mode
- Copy **proto files** to `dist/proto/` since they're loaded at runtime from the filesystem and cannot be inlined
- Update **.vscodeignore** to include `dist/` and exclude `out/`, `src/`, and `node_modules/` (deps are now bundled)
- Add dev-only directories (`.beads/`, `.claude/`, `openspec/`, `dev/`) to `.vscodeignore` to reduce package bloat
- Update **CI/CD workflows** (`ci.yml`, `publish.yml`) to use the new build commands

## Capabilities

### New Capabilities
- `esbuild-bundling`: Bundle extension source and all production dependencies into a single file using esbuild

### Modified Capabilities

## Impact

- `package.json` — new devDependency (esbuild), updated scripts, changed `main` entry point
- `esbuild.mjs` — new build configuration file
- `.vscodeignore` — updated to include `dist/` and exclude dev artifacts
- `.github/workflows/ci.yml` — updated compile step
- `.github/workflows/publish.yml` — updated compile step
- `tsconfig.json` — no changes needed (esbuild handles its own compilation)
- `src/grpc/armadaClient.ts` — `__dirname` path to proto files may need adjustment for bundled output
