## Why

Clicking a job in the tree view reveals no information — the tree item label and state are the only data visible. Users must leave VS Code and open the Lookout web UI to see resource requests, node assignment, run history, and event timestamps. This is the single biggest daily friction point for ML engineers and operators debugging batch job failures.

## What Changes

Add a `vscode.WebviewPanel` that opens when a user clicks (or right-clicks → "View Details") a `JobItem` in the tree. The panel fetches job details via `Jobs.GetJobDetails` (gRPC, `expand_job_spec=true`, `expand_job_run=true`) and renders:

- Identity: job ID, queue, job set, owner, submitted timestamp
- Current state and time-in-state (see `time-in-state` change)
- Resource requests: CPU, memory, GPU from `job_spec.scheduling_resource_requirements`
- Run history table: cluster, node, leased/pending/started/finished timestamps, exit code
- Last 5 events summary

## Perspectives

**Job Submitter**: High daily value. Needs GPU count, memory limits, node name, and last events visible without scrolling through raw output. Panel should auto-refresh and show the full lifecycle at a glance — not a JSON dump.

**VS Code Extension**: Use `createWebviewPanel` with `retainContextWhenHidden: true`. Pull data from `getJobDetails` and `LookoutJob.runs`. Use VS Code CSS variables (`var(--vscode-editor-foreground)`) for theme compatibility. Avoid heavy frameworks — template-literal HTML with `<table>` for run history renders instantly. Post data via `panel.webview.postMessage`.

**DevSecOps**: WebView panels are the highest-risk VS Code surface. Job specs may contain env var values, secret references, or node assignment details. All content passed via `postMessage` must be sanitized to prevent XSS. Require strict CSP (`default-src 'none'`), explicit field allow-listing (no object spreading), and audit whether `expand_job_spec: true` is needed — restrict what fields are rendered.

**Armada Developer**: `JobDetails` message provides `submitted_ts`, `last_transition_ts`, `latest_run_id`, and `job_runs` array with per-run cluster and node info. Resource requests come from `job_spec.scheduling_resource_requirements`. Older Armada deployments may not expose the Query API — degrade gracefully with a "details unavailable" state.

## Security Considerations

- Strict Content Security Policy on WebView: `default-src 'none'; style-src 'unsafe-inline'`
- All strings from job details HTML-escaped before injection
- No object spreading into `postMessage` payload — explicit field allow-list only
- `retainContextWhenHidden: false` to avoid background data retention if job contains sensitive specs

## Capabilities

### New Capabilities

- `job-detail-panel`: WebView panel showing job identity, resource requests, run history, and events for any selected job

### Modified Capabilities

- `jobTreeProvider`: `JobItem` click handler opens detail panel instead of doing nothing

## Impact

- `src/providers/jobTreeProvider.ts` — add click handler on `JobItem`
- `src/panels/jobDetailPanel.ts` — new file: WebView panel implementation
- `src/grpc/armadaClient.ts` — ensure `getJobDetails` passes `expand_job_run: true`
- `package.json` — register `armada.viewJobDetails` command with context menu on `viewItem == job`
