## Why

Most ML engineers submit variations of the same job repeatedly — same GPU type, same image, same resource requests — varying only the command or experiment name. Each submission currently requires hand-editing the full YAML. Job templates allow saving and recalling named specs, eliminating repetitive YAML authoring.

## What Changes

Add two commands:
- `armada.saveTemplate`: Save the current editor's job spec as a named template (prompt for name via `InputBox`)
- `armada.loadTemplate`: QuickPick list of saved templates → opens the spec in a new untitled YAML editor for modification before submit

Storage: `vscode.ExtensionContext.globalState` as `Map<string, string>` (template name → YAML string). Cap at 100KB total to respect `globalState` size limits.

Before saving, strip volatile fields: `clientId` (regenerated per submission) and optionally `jobSetId` (likely varies per run) to keep templates reusable.

## Perspectives

**Job Submitter**: Medium value. Templates instantiated into a new editor buffer (not destructively applied to existing files) is the correct UX — the user can modify before submitting. Named templates selected via QuickPick fit the existing command palette workflow. Stripping `jobSetId` on save means the template is immediately reusable across different runs.

**VS Code Extension**: Use `globalState.get/update` with a single serialized JSON map. `loadTemplate` opens the spec via `vscode.workspace.openTextDocument({ language: 'yaml', content: yaml.dump(spec) })` in a new untitled buffer — do not overwrite existing files. Cap stored templates at 100KB (check with `globalState.get()` before saving). `saveTemplate` validates the current document parses as a valid Armada job spec before saving.

**DevSecOps**: Templates are saved job specs that may contain image references, namespace names, resource requests, and env variable names. They must never store secret values — if a spec contains `secretKeyRef` or literal env var values that look like tokens, warn the user at save time. Storage in `globalState` (user-scoped) is correct — do NOT use `workspaceState` (workspace-scoped, might leak into shared repos). `globalState` is not encrypted; document that templates are stored in VS Code's extension storage and should not contain secrets.

**Armada Developer**: Pure VS Code storage — no Armada API involvement. Strip fields before saving: `clientId` (server-assigned, auto-generated), and optionally `jobSetId` (prompt user whether to save it). Preserve `queue`, `priority`, `namespace`, `podSpec`, `labels`, `annotations`. Note that template YAML must remain valid after stripping — validate with `js-yaml` after field removal before storing.

## Security Considerations

- Warn at save time if spec contains values that look like secrets (check for `secretKeyRef`, env names containing TOKEN/KEY/PASSWORD/SECRET)
- Storage in `globalState` (user-scoped), not `workspaceState`
- Document that `globalState` is not encrypted — do not store literal secret values in templates
- Cap at 100KB total to prevent `globalState` bloat

## Capabilities

### New Capabilities

- `job-templates`: Save and load named job spec templates from VS Code global storage

## Impact

- `src/commands/saveTemplate.ts` — new file
- `src/commands/loadTemplate.ts` — new file
- `src/extension.ts` — register both commands
- `package.json` — register commands; add to command palette and `.armada.yaml` editor context menu
