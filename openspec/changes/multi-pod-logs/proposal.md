## Why

The extension hardcodes `podNumber: 0` in `viewJobLogs.ts` line 42. For distributed training jobs (multi-node PyTorch, MPI workloads) or gang-scheduled jobs with multiple pod specs, pod 0 may not be the pod where the failure occurred. Users currently have no way to inspect logs from other pods without using `kubectl` or the Lookout UI.

## What Changes

Before calling `getJobLogs`, query `Jobs.GetJobDetails` with `expand_job_run=true` to determine the number of pod specs/runs. If more than one exists, present a `vscode.window.showQuickPick` with entries like `Pod 0 (primary)`, `Pod 1`, etc. The selected pod index is passed to the existing `pod_number` field in the Binoculars `Logs` request.

If only one pod exists, skip the picker entirely to avoid unnecessary friction.

## Perspectives

**Job Submitter**: Medium value — most single-node jobs are unaffected, but distributed training jobs make this critical. Ideal UX: highlight which pods exited non-zero so the user can go directly to the failing pod. A tab strip in the log panel (if using a WebView) would be cleaner than a sequential QuickPick.

**VS Code Extension**: QuickPick before opening the `OutputChannel` is the simplest implementation. Optionally add a codicon `$(error)` prefix to pods with non-zero exit codes. If extending to a WebView panel (from `log-streaming`), consider a tab-per-pod layout. Pod index is a zero-based `int32` — validate it is non-negative and within bounds before the RPC call.

**DevSecOps**: Pod index must be fetched from the API (not user-typed) and validated as non-negative integer within the known pod count. Passing an out-of-bounds or negative index to Binoculars could cause unexpected API behavior. Confirm Binoculars returns a clear error (not a crash) for out-of-range indices.

**Armada Developer**: Binoculars `LogRequest.pod_number` already accepts any int32 — no API change needed. Infer pod count from `pod_specs.length` in the job spec (via `GetJobDetails` with `expand_job_spec=true`) or count distinct run records from `job_runs`. Note: in Armada's gang scheduling model, each gang job member is a separate job — multi-pod here refers to jobs submitted with multiple `pod_specs` in a single `JobSubmitRequestItem`, which is the less common case.

## Security Considerations

- Pod index must be derived from API-returned pod count, not free-form user input
- Validate non-negative integer within bounds before Binoculars RPC call
- No additional authentication concerns beyond existing log access

## Capabilities

### Modified Capabilities

- `viewJobLogs`: Pod selection QuickPick before log fetch when multiple pods exist

## Impact

- `src/commands/viewJobLogs.ts` — add pod count fetch and QuickPick selection before log call
- `src/grpc/armadaClient.ts` — `getJobDetails` call with `expand_job_run: true` for pod count
