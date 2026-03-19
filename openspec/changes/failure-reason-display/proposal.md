## Why

When a job shows `FAILED` in the tree, the user has no idea why without navigating to Lookout or digging through logs. OOM kills, image pull failures, evictions, user code errors, and preemptions each require a completely different response — but the extension treats them identically. This is the most time-consuming daily debugging bottleneck for job submitters.

## What Changes

Surface a human-readable failure reason directly on failed `JobItem` nodes in the tree view, using `TreeItem.description` and `TreeItem.tooltip`. Categories:

- `OOM` — container exit reason contains `OomKilled`
- `Evicted` — reason contains `Evicted`
- `Image pull` — `ErrImagePull` or `ImagePullBackOff`
- `Preempted` — `JobPreemptedEvent` received (separate from `JobFailedEvent`)
- `User error` — non-zero exit code, no infrastructure reason matched
- `Scheduling rejected` — `Cause == Rejected` in `JobFailedEvent`

Source: replay `Event.GetJobSetEvents` to catch `JobFailedEvent.Cause` enum and `ContainerStatus` messages. Fallback to `Jobs.GetJobErrors` for a flat string.

## Perspectives

**Job Submitter**: The single highest-value P1 feature. A label like "OOM killed (requested 16Gi)" surfaced directly in the tree view eliminates the need to open Lookout entirely for common failure modes. Each error category maps to a known remediation action.

**VS Code Extension**: Store failure reason on `JobInfo` so it persists across refreshes. Set it as `description` on `JobItem.updateDisplay()` for immediate visibility — no extra click required. Use `ThemeColor` to color failed items in red consistently.

**DevSecOps**: Failure messages from Armada are operator-controlled strings with no guaranteed sanitization. If rendered in a WebView or tree tooltip, they could contain misleading or injected content. Require HTML-escaping for any WebView rendering; plain-text display in tree tooltips is safe. Confirm Armada API enforces a maximum error message length.

**Armada Developer**: `JobFailedEvent` carries a `Cause` enum (`Error`, `Evicted`, `OOM`, `DeadlineExceeded`, `Rejected`) plus `ContainerStatus[]` with per-container exit codes and reasons. `JobPreemptedEvent` is a distinct oneof branch — check both. `GetJobErrors` returns a flat string; the event stream approach is richer but requires the `queue`/`job_set_id` pair. Preemption carries `preemptive_job_id` for full context.

## Security Considerations

- Failure reason strings must be HTML-escaped before any WebView rendering
- Display as plain text in tree item `description`/`tooltip` (safe by default in VS Code API)
- Do not log full error message to output channel without a debug flag — may contain sensitive path/config info from user workloads

## Capabilities

### New Capabilities

- `failure-reason-display`: Categorized failure reason shown on failed job tree nodes without requiring additional navigation

### Modified Capabilities

- `jobTreeProvider`: `handleJobEvent` updates `JobInfo.failureReason` on terminal events; `JobItem.updateDisplay()` renders it

## Impact

- `src/types/armada.ts` — add `failureReason?: string` and `failureCategory?: FailureCategory` to `JobInfo`
- `src/providers/jobTreeProvider.ts` — parse failure events and update job info
- `src/grpc/armadaClient.ts` — ensure failure-related events are handled in `convertEventFromProto`
