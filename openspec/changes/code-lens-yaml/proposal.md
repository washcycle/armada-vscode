## Why

Submitting a job currently requires opening the command palette and finding `Armada: Submit Job`. Users who are actively editing a `.armada.yaml` file have to leave the editor context to submit. Code lens actions — inline buttons that appear above the job spec — make Submit, Validate, and Dry-run available without any navigation, following the same pattern as other VS Code language tools (e.g., Run Test, Go to References).

## What Changes

Register a `vscode.CodeLensProvider` for `{ language: 'yaml', pattern: '**/*.armada.yaml' }`:
- Parse document on save (debounced, not on every keystroke) using `js-yaml` (already a dependency)
- If root keys `queue` and `jobs` are present, emit three `CodeLens` at line 0:
  - `▶ Submit` → `armada.submitJob`
  - `✓ Validate` → `armada.validateJob` (client-side schema check, no cluster needed)
  - `⟳ Dry Run` → `armada.dryRunJob` (submit + immediate cancel via `CancelJobSet`)

## Perspectives

**Job Submitter**: High value — eliminates the friction of switching to command palette while editing. Having Submit, Validate, and Dry-run as three distinct lens actions covers the full pre-submission workflow. Validate should work without a live cluster connection (pure schema check) so it works locally.

**VS Code Extension**: Register with `vscode.languages.registerCodeLensProvider`. Parse with `js-yaml` on document save (implement `onDidChangeCodeLenses` with document-save event, not `onDidChangeTextDocument`). Position all lenses at line 0. Each maps to an existing or new command via `CodeLens.command`. Avoid heavy parsing on every keystroke — debounce to save events only.

**DevSecOps**: Code lens Submit must preserve the existing confirmation dialog in `submitJobCommand` — this is non-negotiable. The lower-friction path cannot bypass the "Submit N jobs?" confirmation. Dry-run must make clear in the UI that it is a real submission immediately cancelled — there is a non-atomic window where the job could be picked up. Use a clearly named job set ID (`vscode-dryrun-<timestamp>`) and cancel the entire set with `CancelJobSet` to minimize the window. Validate must be clearly distinct from Submit — different codicon, different label.

**Armada Developer**: No dedicated dry-run RPC exists in Armada's API. Dry-run is implemented as: `SubmitJobs` with job set ID `vscode-dryrun-<timestamp>`, then immediately `CancelJobSet` on that job set ID. This is not atomic — there is a window where the job may be leased. For Validate, parse the YAML against the `JobSubmitRequest` schema client-side. Submit calls the existing `submitJobs` path unchanged.

## Security Considerations

- Confirmation dialog from `submitJobCommand` MUST be preserved for the Submit code lens
- Dry-run is a real submission — name the job set clearly (`vscode-dryrun-<ts>`) and always follow with `CancelJobSet`
- Validate action must work without cluster connectivity (pure schema validation)
- Code lens must not appear on non-`.armada.yaml` YAML files

## Capabilities

### New Capabilities

- `code-lens-yaml`: Inline Submit / Validate / Dry-run actions in `.armada.yaml` files
- `validate-job`: Client-side schema validation of job spec without cluster connection

## Impact

- `src/providers/armadaCodeLensProvider.ts` — new file: `CodeLensProvider` implementation
- `src/commands/validateJob.ts` — new file: schema validation command
- `src/commands/dryRunJob.ts` — new file: submit + immediate cancel
- `src/extension.ts` — register `CodeLensProvider`
- `package.json` — register `armada.validateJob` and `armada.dryRunJob` commands
