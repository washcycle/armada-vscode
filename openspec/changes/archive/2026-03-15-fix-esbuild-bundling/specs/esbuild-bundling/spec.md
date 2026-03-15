## ADDED Requirements

### Requirement: Bundle production dependencies into extension output
The build process SHALL use esbuild to bundle all production dependencies into a single output file.

#### Scenario: Extension activates from marketplace install
- **WHEN** a user installs the extension from the VS Code Marketplace
- **THEN** the extension SHALL activate without module-not-found errors for `@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs`, or `js-yaml`

#### Scenario: Single bundled output file
- **WHEN** the build runs `vscode:prepublish`
- **THEN** the output SHALL be a single `dist/extension.js` file containing all production dependency code

### Requirement: Proto files available at runtime
The build process SHALL copy proto files to the output directory since they are loaded from the filesystem at runtime.

#### Scenario: Proto files copied to dist
- **WHEN** the build completes
- **THEN** all files from `src/proto/` SHALL be present at `dist/proto/` preserving directory structure

#### Scenario: gRPC client loads proto files
- **WHEN** the extension creates an ArmadaClient
- **THEN** proto files SHALL be resolved relative to the bundled extension's `__dirname`

### Requirement: vscode module excluded from bundle
The bundler SHALL treat the `vscode` module as external since it is provided by the VS Code runtime.

#### Scenario: vscode not bundled
- **WHEN** esbuild processes the source
- **THEN** `require('vscode')` calls SHALL remain as external requires, not inlined

### Requirement: Development artifacts excluded from VSIX
The `.vscodeignore` SHALL exclude development-only directories from the packaged extension.

#### Scenario: Dev directories excluded
- **WHEN** `vsce package` creates the VSIX
- **THEN** `.beads/`, `.claude/`, `openspec/`, `dev/`, and `out/` SHALL NOT be included in the package

### Requirement: Watch mode for development
The build SHALL provide a watch mode for development that rebuilds on file changes.

#### Scenario: Developer runs watch mode
- **WHEN** a developer runs `npm run watch`
- **THEN** esbuild SHALL watch for source file changes and rebuild incrementally
