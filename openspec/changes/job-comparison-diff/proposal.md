## Why

When two similar jobs have different outcomes — one succeeded, one failed — the fastest debugging path is comparing their specs side-by-side. Currently this requires exporting both specs, creating two files, and using a diff tool. VS Code has a built-in diff editor that can be invoked programmatically with zero custom UI.

## What Changes

Add `armada.compareJobs` command, accessible when two jobs are selected in the tree (multi-select from `bulk-job-operations`):
1. Fetch both job specs via `Jobs.GetJobDetails([id1, id2], expandJobSpec=true)`
2. Strip server-set fields from both: `id`, `owner`, `created`, `scheduling_resource_requirements`
3. Serialize each to YAML via `js-yaml`
4. Register a `TextDocumentContentProvider` with an `armada-spec:` URI scheme
5. Invoke `vscode.commands.executeCommand('vscode.diff', uriA, uriB, 'Job A vs Job B')`

The built-in diff editor provides syntax highlighting, inline vs. side-by-side toggle, and navigation for free.

## Perspectives

**Job Submitter**: Low daily use — occasional debugging scenario. Done well, it opens the standard VS Code diff editor with both specs as YAML, which immediately feels native. Having it accessible from multi-select in the tree (select two jobs, right-click, "Compare specs") is the natural UX.

**VS Code Extension**: Use `vscode.commands.executeCommand('vscode.diff', uriA, uriB)` — the built-in diff editor. No WebView needed. Register a `vscode.TextDocumentContentProvider` for the `armada-spec:` URI scheme that returns the YAML string. URIs encode the job ID in the path. This is the most idiomatic VS Code approach and gives syntax highlighting and side-by-side toggle for free.

**DevSecOps**: A job spec diff view renders two raw job specs — if specs contain `env` fields with literal secret values (a known anti-pattern but common in practice), those values appear in plaintext in the diff panel. The extension has no mechanism to detect or redact sensitive field values. Require: a configurable allow-list of field name patterns to redact before display (e.g., env var names containing `TOKEN`, `KEY`, `PASSWORD`, `SECRET`). Display a warning if the spec contains `env` fields before rendering. No WebView CSP concerns since this uses the built-in diff editor.

**Armada Developer**: Both job specs from `GetJobDetails` with `expand_job_spec=true`. Strip before diffing: `id`, `owner`, `created`, `scheduling_resource_requirements` — these are server-set and will always differ between two jobs, creating noise in the diff. The remaining spec (pod spec, priority, labels, annotations, namespace, scheduler) is the user-authored content worth comparing. Serialize with `js-yaml` using consistent options (e.g., `indent: 2`) so the diff is meaningful rather than showing formatting differences.

## Security Considerations

- Configurable redaction pattern list for env var names matching secret indicators (TOKEN, KEY, PASSWORD, SECRET)
- Display a warning banner if `env` fields are present: "This spec may contain sensitive environment variable values"
- Strip server-set fields before display to reduce diff noise and avoid exposing internal IDs
- Uses built-in diff editor — no WebView CSP concerns

## Capabilities

### New Capabilities

- `job-comparison-diff`: Side-by-side YAML diff of two job specs using VS Code's built-in diff editor

## Impact

- `src/commands/compareJobs.ts` — new file
- `src/providers/armadaSpecProvider.ts` — new file: `TextDocumentContentProvider` for `armada-spec:` URI scheme
- `src/extension.ts` — register `TextDocumentContentProvider`
- `package.json` — register `armada.compareJobs` command on multi-select job context menu
- Depends on: `bulk-job-operations` (multi-select tree view)
