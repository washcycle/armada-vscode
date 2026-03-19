## Why

After submitting a job, users sometimes need to promote it (it's blocking a deployment) or demote it (low-priority sweep consuming too much capacity). Currently the only option is cancel and resubmit, losing queue position and requiring YAML edits. The Armada gRPC API has `ReprioritizeJobs` — it is not wired in the extension.

## What Changes

Register `armada.reprioritizeJob` as a context-menu command on `JobItem`. The command:
1. Shows current priority pre-filled in an `InputBox` with numeric validation
2. Calls `Submit.ReprioritizeJobs` gRPC with the new priority
3. Handles partial failure via `reprioritization_results` map (job ID → error string)
4. Updates `job.jobInfo.priority` in-place and refreshes the tree
5. Warns if job is not in QUEUED state (reprioritization only affects queued jobs)

## Perspectives

**Job Submitter**: Medium daily value for single jobs, would become high if extended to entire job sets. Key UX detail: pre-fill the current priority so the user knows what they're changing from. Immediate tree view update after success confirms the change took effect.

**VS Code Extension**: Register with `when: "viewItem == job"` on job context menu. Use `showInputBox` with `value` pre-populated from `jobInfo.priority` and `validateInput` rejecting non-numeric/out-of-range values. After success, update `JobInfo.priority` in place and call `refresh()` — no tree rebuild needed.

**DevSecOps**: Priority changes affect scheduling fairness across all tenants. The extension must surface `PERMISSION_DENIED` explicitly — not all submitters have reprioritize rights in Armada RBAC. Do not silently retry. The server response's `reprioritization_results` map may indicate partial failures (some job IDs rejected) — surface these distinctly. No confirmation dialog required for single-job reprioritize (low blast radius), but consider one for job-set reprioritize if extended.

**Armada Developer**: Use `Submit.ReprioritizeJobs` with `JobReprioritizeRequest` (fields: `job_ids[]`, `job_set_id`, `queue`, `new_priority`). Response's `reprioritization_results` maps job ID to error string — empty string means success. Reprioritization only affects QUEUED jobs; leased/running jobs are silently ignored by the server (no error returned), so the extension must check `jobInfo.state == QUEUED` and warn otherwise. This RPC is not yet in `armadaClient.ts`.

## Security Considerations

- `PERMISSION_DENIED` gRPC error must be surfaced as a clear permission error, not a generic failure
- Server response must be checked for per-job errors in `reprioritization_results`
- Warn user when job is not in QUEUED state to set correct expectations

## Capabilities

### New Capabilities

- `reprioritize-job`: Change a queued job's priority after submission without cancellation

### Modified Capabilities

- `armadaClient`: Add `reprioritizeJobs(queue, jobSetId, jobIds, newPriority)` method

## Impact

- `src/commands/reprioritizeJob.ts` — new file
- `src/grpc/armadaClient.ts` — add `reprioritizeJobs` method
- `src/types/armada.ts` — ensure `priority` field on `JobInfo` is mutable
- `package.json` — register command with `viewItem == job` context condition
