## Why

Infrastructure blips (transient OOMs, image registry timeouts, node failures) cause jobs to fail with no change needed to the spec. The current workflow is: find the original YAML file, submit again. The extension has all the information needed to resubmit directly from the tree view — it just doesn't expose the command.

## What Changes

Add `armada.resubmitJob` as a context-menu command on failed `JobItem` nodes:
1. Fetch original job spec via `Jobs.GetJobDetails` with `expand_job_spec=true`
2. Strip server-set fields: `id`, `owner`, `created`, `scheduling_resource_requirements` (explicitly rejected by server if present)
3. Show a read-only spec preview in a QuickPick detail or diff panel before confirmation
4. Call `Submit.SubmitJobs` with a new `clientId`
5. Optionally: "Resubmit with edits" variant that opens the stripped spec in an untitled YAML editor

## Perspectives

**Job Submitter**: High value — failed jobs are a constant occurrence and the fix is usually "just run it again." One right-click → "Resubmit" covers the common case. "Resubmit with edits" (opens a buffer to modify first) covers the "bump the memory limit" case. The new job should appear in the tree immediately after submission.

**VS Code Extension**: Show on `JobItem` context menu with `when: "viewItem == job"` filtered to FAILED state. Offer two variants: "Resubmit" (direct) and "Resubmit with edits" (opens untitled YAML buffer). After successful resubmit, call `jobTreeProvider.addJob()` with the new job ID. Use `vscode.commands.executeCommand('vscode.diff', ...)` for the spec preview if showing differences from the last-run spec.

**DevSecOps**: Resubmitting uses the original spec, which may contain stale image tags, references to deleted secrets or ConfigMaps, or specs that failed due to policy violations. Display the full spec in a read-only preview before confirmation. Clearly label the spec as "original spec from [timestamp]" so users know what they're resubmitting. If the original failure was RBAC/policy-related, surface that prominently in the preview — resubmit will likely fail again.

**Armada Developer**: `Jobs.GetJobDetails` with `expand_job_spec=true` returns the `Job.job_spec` field. Strip before resubmitting: `id`, `owner`, `created`, `scheduling_resource_requirements` (server fills this from pod spec resources — submitting with it pre-populated is rejected per proto comment). Generate a new `clientId` (UUID) or prompt the user. The new job gets a new ID — the original failed job remains in the tree separately. Prompt for `jobSetId` — user may want to resubmit into the same or a different job set.

## Security Considerations

- Read-only spec preview required before confirmation — user must see what they're resubmitting
- Label spec as "original spec from [timestamp]" to prevent false assumption of freshness
- If failure category is policy/RBAC-related (from `failure-reason-display`), show warning: "This job failed due to [permission denied] — resubmit will likely fail again"
- Strip server-set fields that could cause rejection: `id`, `owner`, `created`, `scheduling_resource_requirements`

## Capabilities

### New Capabilities

- `resubmit-failed-job`: One-click resubmit of a failed job with original or modified spec

## Impact

- `src/commands/resubmitJob.ts` — new file
- `src/grpc/armadaClient.ts` — ensure `getJobDetails` with `expandJobSpec: true` is available
- `package.json` — register command on `viewItem == job` context menu (shown for FAILED state)
