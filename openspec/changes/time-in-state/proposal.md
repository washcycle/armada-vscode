## Why

A job showing `QUEUED` could have been waiting 30 seconds or 3 hours — the tree view provides no way to distinguish. Time-in-state is the primary signal for detecting stuck jobs, scheduling backlog, and SLA violations without opening an external dashboard.

## What Changes

Add an elapsed-time string to each `JobItem` in the tree as `TreeItem.description`, formatted as `QUEUED 1h 23m` or `RUNNING 45s`. The timestamp is sourced from `JobDetails.last_transition_ts` (server-side) to avoid clock skew. The existing auto-refresh timer fires `refresh()` on the whole tree — no per-job intervals needed.

## Perspectives

**Job Submitter**: Medium daily value individually, but becomes high when combined with notifications or thresholds. Knowing a job has been PENDING for 2h vs 2s tells me whether there's a scheduling issue without opening Lookout. The compact format `QUEUED 1h 23m` directly in the tree node is ideal.

**VS Code Extension**: Store `stateEnteredAt: Date` on `JobInfo`, updated whenever `updateJobState` fires. Format elapsed time in `JobItem.updateDisplay()` and set as `description`. The existing 5-second auto-refresh timer in `extension.ts` is sufficient — avoid creating a per-job `setInterval` which would accumulate hundreds of timers for large job sets.

**DevSecOps**: Low security risk, but the state timestamp must come from the Armada server, not the local client clock, to be trustworthy for SLA auditing. Local observation timestamps are unreliable because the event stream can reconnect and replay events.

**Armada Developer**: `JobDetails.last_transition_ts` from `Jobs.GetJobDetails` is the correct server-side source. For jobs already in the tree via event stream, record the `created` timestamp from each state-transition event as it arrives. Display with second-level precision — sub-second elapsed time is not meaningful and Kubernetes clock skew makes millisecond precision misleading.

## Security Considerations

- No security concerns — this is a read-only display computed from already-loaded data
- Timestamp must be sourced from server to prevent misleading SLA audit trails

## Capabilities

### New Capabilities

- `time-in-state`: Elapsed time shown on each job tree node, sourced from server-side transition timestamps

### Modified Capabilities

- `jobTreeProvider`: `JobItem.updateDisplay()` formats and shows elapsed time in tree description

## Impact

- `src/types/armada.ts` — add `stateEnteredAt?: Date` to `JobInfo`
- `src/providers/jobTreeProvider.ts` — record transition time in `updateJobState`, format in `updateDisplay`
- No new API calls required
