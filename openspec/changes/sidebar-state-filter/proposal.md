## Why

When a job sweep produces 40 jobs, operators only want to see FAILED ones during triage. The current tree view shows all jobs with no filtering — users must scroll through a flat list mixing running, succeeded, and failed jobs. This is a daily usability problem for anyone with more than a handful of active job sets.

## What Changes

Add a multi-select state filter to the job tree view:
1. Add `armada.filterByState` command to the tree view's `...` title menu (`menus["view/title"]`)
2. Present `showQuickPick` with `canPickMany: true` and all `JobState` enum values
3. Store the active filter set on `JobTreeProvider`
4. Apply the filter in `getChildren()` before returning `JobItem` list
5. Show active filter count in `TreeView.description` (e.g., "Armada Jobs (filtered: 2 states)")

An empty filter set means "show all." Filter state persists per VS Code session (not `workspaceState` — see security note).

## Perspectives

**Job Submitter**: High daily value. Filter chips or a dropdown at the top of the tree view that persists across refreshes eliminates the most common triage friction. One-click "show only FAILED" is the dominant use case. The filter should update the view instantly without a full API refetch.

**VS Code Extension**: This is a purely client-side filter on already-loaded data. Store active filter as `Set<JobState>` on `JobTreeProvider`. Apply in `getChildren()` by checking `jobItem.jobInfo.state`. Show active state in `TreeView.description` via `createTreeView`. A `$(filter)` codicon button in the tree view title bar is the standard VS Code pattern for this. `canPickMany: true` on `QuickPick` is the key API flag.

**DevSecOps**: Low security risk — this is a display filter on already-fetched data. Important operational note: filter state must not persist in `workspaceState` in a way that silently hides failure events from an operator. If the filter is active when the extension opens, a clear indicator must be visible. Filtering does not reduce API calls — the extension still receives all job events regardless of filter state.

**Armada Developer**: The Lookout v2 API supports state-based filtering in `LookoutJobsRequest.filters` — if/when the tree is backed by Lookout queries rather than event streams, the filter can be pushed server-side. For the current event-stream model, client-side filtering is correct. Supported Lookout state strings: `QUEUED`, `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `PREEMPTED`.

## Security Considerations

- Filter state must not persist across VS Code restarts in `workspaceState` (could silently hide failures)
- Display a visible "filter active" indicator whenever fewer than all states are shown
- Filtering is a display concern only — does not reduce event stream subscriptions or API load

## Capabilities

### New Capabilities

- `sidebar-state-filter`: Multi-state filter on the job tree view with visible active-filter indicator

### Modified Capabilities

- `jobTreeProvider`: Apply state filter in `getChildren()`; store active filter state

## Impact

- `src/providers/jobTreeProvider.ts` — add `activeStateFilter: Set<JobState>`, filter in `getChildren`
- `src/commands/filterByState.ts` — new file
- `package.json` — register command in `menus["view/title"]` for the Armada tree view
