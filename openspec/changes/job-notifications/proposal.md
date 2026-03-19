## Why

Users submit training jobs and then switch to other work for 30–60 minutes. Without notifications, failures go unnoticed for extended periods. The event stream is already live in `JobTreeProvider` — it already detects terminal state transitions. The only missing piece is surfacing these as VS Code notifications with actionable buttons.

## What Changes

In `JobTreeProvider.handleJobEvent`, detect terminal-state transitions (SUCCEEDED, FAILED, CANCELLED, PREEMPTED) and fire:
- `vscode.window.showInformationMessage` for SUCCEEDED with "View Details" button
- `vscode.window.showErrorMessage` for FAILED/PREEMPTED with "View Logs" and "View Details" buttons

Gate behind:
1. An explicit per-job opt-in: "Watch for completion" right-click on `JobItem` (stored in a `Set<jobId>`)
2. A global `armada.notifications.enabled` setting (default: true)
3. A startup suppression set: jobs already in terminal state at load time never trigger notifications

## Perspectives

**Job Submitter**: High daily value. Submit a job, come back when it's done. The notification must include the failure reason (from `failure-reason-display`) and an action button to open logs directly — not just "job finished." Explicit opt-in per job (right-click "Watch") is better than notifications for every job in every loaded job set.

**VS Code Extension**: Detect terminal transitions by comparing new state to previous state in `updateJobState`. Only notify if: (a) job is in the watched set, (b) new state is terminal, (c) previous state was not terminal. The startup suppression set prevents notification spam on extension restart when historical events replay. Gate behind a `workspaceState`-scoped watched set (not `globalState`).

**DevSecOps**: VS Code notifications surface to the desktop OS notification system — on shared machines or screen sharing, they expose job names, queue names, and failure reasons. Require: explicit opt-in per job (not opt-out), configurable content suppression (`armada.notifications.showDetails: false` shows only "a watched job changed state" without naming it). Watched job list must be in `workspaceState` (workspace-scoped) not `globalState` (which persists across all workspaces).

**Armada Developer**: No new API calls. The `watchEvents` event stream in `JobTreeProvider` already fires for all loaded job sets. The key is correctly identifying first-occurrence terminal transitions vs event-stream replays on reconnect. Track a `Set<jobId>` of jobs seen in terminal state to suppress replayed events. `JobSucceededEvent`, `JobFailedEvent`, `JobCancelledEvent`, and `JobPreemptedEvent` are the relevant event types.

## Security Considerations

- Explicit opt-in per job ("Watch for completion") — not notifications for every loaded job
- `armada.notifications.showDetails` setting: when false, show only "a watched job changed state" without job name/queue
- Watched job list stored in `workspaceState` (workspace-scoped), not `globalState`
- Startup suppression: jobs already terminal at extension load time never trigger notifications (prevents replay spam)

## Capabilities

### New Capabilities

- `job-notifications`: Desktop notifications when explicitly watched jobs reach terminal states

### Modified Capabilities

- `jobTreeProvider`: Track watched jobs, detect terminal transitions, fire notifications

## Impact

- `src/providers/jobTreeProvider.ts` — add watched job set, terminal transition detection, notification firing
- `src/commands/watchJob.ts` — new file: "Watch for completion" context menu command
- `package.json` — add `armada.notifications.enabled` and `armada.notifications.showDetails` settings, register watch command
