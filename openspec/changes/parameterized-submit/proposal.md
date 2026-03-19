## Why

The most common pre-submission edit is changing the Docker image tag, the experiment name (env var), or the job priority. Currently users must edit the YAML file, submit, then revert their edits. A parameterized submit dialog surfaces just those overridable fields at submit time without touching the source file.

## What Changes

Extend `submitJobCommand` to detect template variables in the YAML using a `${VARIABLE_NAME}` syntax, and/or present a "quick override" dialog for common fields before each submission:

1. Detect `${...}` placeholders in the raw YAML string
2. Prompt for each placeholder value via `InputBox` (in sequence)
3. Substitute values into the raw YAML string before `js-yaml` parsing
4. Optionally: always show priority and image overrides for any `.armada.yaml` submission

Implementation: string substitution on the raw YAML before `yaml.load()` — avoids deep-merging complex nested pod specs.

## Perspectives

**Job Submitter**: High value — the single most common friction before submit is changing image tag, env var, or priority. A small form pre-populated from the YAML with just those overridable fields is ideal. The `${IMAGE}` / `${PRIORITY}` placeholder syntax is self-documenting in the YAML file.

**VS Code Extension**: Extend `submitJobCommand` options with an `overrides?: Record<string, string>` parameter. Detect `${...}` patterns with a regex scan of the raw document text before parsing. Present `showInputBox` for each, collecting values. Apply via string replace before `yaml.load()`. The existing `options?: { skipConfirmation?: boolean }` parameter shows the extension point is already there.

**DevSecOps**: The image field accepting arbitrary string input could allow submission of an untrusted image if not validated. At minimum, validate the image field format (registry/name:tag pattern). Overriding env vars at submit time could accidentally expose literal secret values in the verbose job spec logging (`JSON.stringify` in `armadaClient.ts`) — that logging must be gated behind a debug flag before this feature ships. Show a preview of the full merged spec before final confirmation.

**Armada Developer**: No new API involvement — this is a pre-processing step before the existing `submitJobs` call. Substitution on raw YAML string (before `yaml.load()`) is correct for simple overrides. For container image: navigate into `pod_specs[].containers[]` in the parsed spec. For priority: `JobSubmitRequestItem.priority` is a top-level field. For env vars: inject into `containers[].env[]` array. All substitution happens client-side before the gRPC call.

## Security Considerations

- Image field: validate registry/name:tag format before submission
- Verbose job spec logging in `armadaClient.ts` (JSON.stringify) must be gated behind debug flag before this ships — env var override values would otherwise be logged in plaintext
- Show a preview/summary of overridden fields before the final confirmation step
- Placeholder syntax (`${...}`) must be clearly documented to prevent accidental variable leakage

## Capabilities

### New Capabilities

- `parameterized-submit`: Template variable substitution and quick-override dialog at job submission time

### Modified Capabilities

- `submitJob`: Pre-submission variable detection and value prompting

## Impact

- `src/commands/submitJob.ts` — add variable detection, substitution loop, and preview step
- `src/extension.ts` — no changes to command registration needed
- README — document `${VARIABLE_NAME}` placeholder syntax
