## Why

When a hyperparameter sweep or batch run is misconfigured, users need to cancel all jobs in a job set immediately. The current extension only supports cancelling jobs one at a time, making bulk cancellation of 50+ jobs impractical. The Armada gRPC API has `CancelJobSet` exactly for this purpose — it is simply not wired up.

## What Changes

Register `armada.cancelJobSet` as a context-menu command on `JobSetItem` tree nodes. The command:
1. Fetches the current job count for the set
2. Shows a warning confirmation: "Cancel all N jobs in job set X?"
3. Calls `Submit.CancelJobSet` gRPC with an optional `JobSetFilter` (e.g. only QUEUED/PENDING, leaving running jobs)
4. Reports result in the output channel and a notification
5. Refreshes the tree

Optionally expose a state filter QuickPick (cancel only queued? only running? all?) before confirmation.

## Perspectives

**Job Submitter**: High daily value. One right-click action on the job set node is the expected UX. Confirmation dialog must show the job count so the user understands scope. Filtering to cancel only queued jobs (leaving running ones) would be a valuable option for in-flight sweeps.

**VS Code Extension**: Register with `when: "view == armadaJobsView && viewItem == jobset"` in `package.json` menus. Show `showWarningMessage` with the count before proceeding. Use `Promise.allSettled` if falling back to per-job calls. Prefer the single `CancelJobSet` RPC — it's atomic and far more efficient.

**DevSecOps**: Bulk destructive operation — the highest blast-radius command added so far. Confirmation dialog with explicit count is non-negotiable. Server RBAC will reject unauthorized calls, but the extension must surface `PERMISSION_DENIED` as a clear human-readable error, not a generic failure. Log every cancel-job-set action to the output channel with timestamp, queue, job set ID, and initiating user context for audit purposes.

**Armada Developer**: Use `Submit.CancelJobSet` with `JobSetCancelRequest` — already in submit.proto but not wired in `armadaClient.ts`. Pass `JobSetFilter` with `active_job_states` to restrict cancellation to specific states if desired (e.g. `[QUEUED, PENDING]` leaves running jobs). This is a different RPC from `CancelJobs` (per-job); `CancelJobSet` is per-set and single-RPC. It returns immediately — monitor the event stream for confirmation of individual job cancellations.

## Security Considerations

- Modal confirmation with explicit job count required before execution
- `PERMISSION_DENIED` gRPC error must surface as a clear "you don't have permission to cancel this job set" message
- Audit log entry in output channel on success and failure (queue, job set, timestamp, context name)
- No retry logic on rejection — one attempt, clear failure message

## Capabilities

### New Capabilities

- `cancel-job-set`: Single-command cancellation of all jobs in a job set with confirmation and optional state filter

### Modified Capabilities

- `armadaClient`: Add `cancelJobSet(queue, jobSetId, filter?)` method wrapping `Submit.CancelJobSet`

## Impact

- `src/commands/cancelJobSet.ts` — new file
- `src/grpc/armadaClient.ts` — add `cancelJobSet` method
- `src/providers/jobTreeProvider.ts` — wire command to `JobSetItem` context
- `package.json` — register command with `viewItem == jobset` context condition
