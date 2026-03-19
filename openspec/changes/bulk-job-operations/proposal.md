## Why

Cancelling or resubmitting jobs one at a time is impractical when a misconfigured sweep produces 50+ failed jobs across multiple job sets that need to be cleaned up. `cancel-job-set` covers the whole-set case, but users sometimes need to act on a filtered selection (e.g., only the FAILED jobs across two different job sets). Multi-select tree operations fill this gap.

## What Changes

Enable multi-select on the Armada job tree view and add bulk action commands:

1. Set `canSelectMany: true` on the existing `TreeView` in `extension.ts`
2. Update `cancelJobCommand` to accept `item[]` (VS Code passes focused item + `selectedItems` when multi-select is active)
3. Add `armada.bulkCancel` command: confirm count, call `Submit.CancelJobs` with batched `job_ids[]` (single RPC supports multiple IDs)
4. Add `armada.bulkResubmit` command: fetch specs via `GetJobDetails(ids[], expandJobSpec=true)`, reconstruct and resubmit

Cap bulk operations at 500 jobs to avoid gRPC message size limits.

## Perspectives

**Job Submitter**: Medium value — cancelling only FAILED jobs across two job sets is the main use case not covered by `cancel-job-set`. Multi-select via checkboxes is the expected UX. The "resubmit all failed" workflow is also valuable after fixing a transient issue (image registry outage, node problem).

**VS Code Extension**: `canSelectMany: true` on `createTreeView` enables multi-select. Commands receive the clicked item as `item` and all selected items as `selectedItems` array. Show a `$(checklist)` codicon button in tree view title to visually indicate multi-select mode. Use `Promise.allSettled` for bulk resubmit to continue despite partial failures. Report partial failures in a summary notification.

**DevSecOps**: Highest blast-radius feature in P3. The confirmation dialog must show explicit job count ("Cancel 312 jobs?") and must be modal — not dismissible by clicking away. Report partial failures distinctly — do not silently swallow them. Apply rate limiting on gRPC calls for bulk resubmit (not bulk cancel, which is a single RPC). Audit log in output channel listing every job ID acted upon. Cap at 500 jobs to prevent gRPC message size issues.

**Armada Developer**: `Submit.CancelJobs` already accepts a `job_ids[]` repeated field — bulk cancel is a single RPC, not N individual calls. Cap at 500 IDs per call to stay within gRPC message size limits (4MB default). For bulk resubmit, call `Jobs.GetJobDetails` with multiple job IDs, strip server-set fields (`id`, `owner`, `created`, `scheduling_resource_requirements`), then call `Submit.SubmitJobs`. New job IDs will be assigned — add newly submitted jobs back to the tree.

## Security Considerations

- Modal confirmation with explicit job count required — cannot be dismissed by clicking away
- Partial failure reporting: surface each failed job ID, not just "some operations failed"
- Audit log of all job IDs acted upon in output channel
- Cap at 500 jobs per operation to prevent gRPC message overflow
- Rate limit bulk resubmit to avoid overwhelming the submission API

## Capabilities

### New Capabilities

- `bulk-job-operations`: Multi-select cancel and resubmit across any combination of jobs in the tree

### Modified Capabilities

- `cancelJob`: Accepts array of jobs when multi-select is active

## Impact

- `src/extension.ts` — add `canSelectMany: true` to `createTreeView`
- `src/commands/bulkCancel.ts` — new file
- `src/commands/bulkResubmit.ts` — new file
- `package.json` — register commands with multi-select context conditions
