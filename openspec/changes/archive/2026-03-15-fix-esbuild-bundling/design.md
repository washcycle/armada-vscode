## Context

The extension currently uses `tsc` to compile TypeScript to `out/` and relies on `node_modules/` being present at runtime. However, `.vscodeignore` excludes `node_modules/**`, so the VSIX package from the marketplace is missing all production dependencies. Microsoft's recommended approach is to bundle with esbuild or webpack.

The extension has a special constraint: proto files (`.proto`) are loaded at runtime from the filesystem via `@grpc/proto-loader.loadSync()` using `path.join(__dirname, '..', 'proto')`. These cannot be inlined into a JS bundle.

## Goals / Non-Goals

**Goals:**
- Bundle all JS production dependencies into a single `dist/extension.js`
- Maintain proto file loading from filesystem
- Keep the development workflow fast with esbuild watch mode
- Reduce VSIX package size by excluding dev artifacts
- Fix the broken marketplace install

**Non-Goals:**
- Migrating proto loading to a different approach (e.g., pre-compiled protobuf)
- Adding source maps to production builds
- Changing the test runner or test configuration

## Decisions

### 1. esbuild over webpack
**Decision**: Use esbuild as the bundler.

**Rationale**: esbuild is faster, simpler to configure, and is Microsoft's recommended choice for VS Code extensions. The extension has straightforward bundling needs — no special loaders or plugins required beyond copying proto files.

**Alternative considered**: webpack with `vscode-extension-webpack` — heavier setup, slower builds, more config boilerplate. Unnecessary for this project's complexity.

### 2. ESM build script (`esbuild.mjs`)
**Decision**: Use an ESM JavaScript config file rather than CLI flags.

**Rationale**: The build needs a copy step for proto files. A script file makes this clean and readable. ESM (`.mjs`) avoids conflicts with the project's CommonJS setup.

### 3. Output to `dist/` not `out/`
**Decision**: Bundle output goes to `dist/`, keeping `out/` for tsc-only development/testing if needed.

**Rationale**: Clean separation. `out/` was the tsc output directory — using `dist/` signals this is a bundled build and avoids confusion during migration.

### 4. Proto file path: `__dirname + '/proto'`
**Decision**: With esbuild outputting to `dist/extension.js`, proto files at `dist/proto/`, the path becomes `path.join(__dirname, 'proto')` instead of the current `path.join(__dirname, '..', 'proto')`.

**Rationale**: Currently `__dirname` points to `out/` and protos are at `out/../proto` = project root `proto/`. Wait — actually protos are copied to `out/proto/` and `__dirname` in `out/grpc/armadaClient.js` is `out/grpc/`, so `..` goes to `out/`, and `out/proto/` is correct. With esbuild, the bundle is a flat `dist/extension.js`, so `__dirname` is `dist/` and protos at `dist/proto/` means the path is just `path.join(__dirname, 'proto')`.

This is a **breaking change in path resolution** that must be updated in `src/grpc/armadaClient.ts`.

### 5. Keep tsc for type checking
**Decision**: Keep `tsc --noEmit` as a type-check-only step in CI, since esbuild doesn't do type checking.

**Rationale**: esbuild strips types but doesn't validate them. Type errors should still be caught in CI.

## Risks / Trade-offs

- **[Proto path change]** The `__dirname` relative path to proto files changes from `path.join(__dirname, '..', 'proto')` to `path.join(__dirname, 'proto')` → Mitigation: Update in `armadaClient.ts` and verify with a test build
- **[Native modules]** `@grpc/grpc-js` is pure JS, but `protobufjs` has optional native components → Mitigation: esbuild handles this fine since the optional deps are not required
- **[Source maps in dev]** esbuild source maps work differently from tsc → Mitigation: Enable source maps in dev/watch mode only
