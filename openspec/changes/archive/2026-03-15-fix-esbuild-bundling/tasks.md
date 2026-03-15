## 1. Setup esbuild

- [x] 1.1 Install esbuild as a devDependency: `npm install --save-dev esbuild`
- [x] 1.2 Create `esbuild.mjs` build script that bundles `src/extension.ts` to `dist/extension.js` with `vscode` as external, CommonJS format, Node platform, and a post-build step to copy `src/proto/` to `dist/proto/`

## 2. Update project configuration

- [x] 2.1 Update `package.json` entry point from `./out/extension.js` to `./dist/extension.js`
- [x] 2.2 Update `package.json` scripts: `vscode:prepublish` to run esbuild production build, `compile` to run esbuild dev build, `watch` to run esbuild watch mode, add `typecheck` script for `tsc --noEmit`
- [x] 2.3 Update `src/grpc/armadaClient.ts` proto path from `path.join(__dirname, '..', 'proto')` to `path.join(__dirname, 'proto')`
- [x] 2.4 Update `.vscodeignore` to include `dist/` and exclude `out/`, `.beads/`, `.claude/`, `openspec/`, `dev/`

## 3. Update CI/CD

- [x] 3.1 Update `.github/workflows/ci.yml`: add typecheck step, ensure compile uses new esbuild script
- [x] 3.2 Update `.github/workflows/publish.yml`: same changes as CI

## 4. Verify

- [x] 4.1 Run `npm run compile` and verify `dist/extension.js` and `dist/proto/` are created
- [x] 4.2 Run `npm run package` and inspect the VSIX to verify it contains `dist/extension.js`, `dist/proto/`, and does NOT contain `node_modules/`, `out/`, `.beads/`, `.claude/`, `openspec/`
