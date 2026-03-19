## Why

The status bar shows the active Armada context name but nothing about what's happening. Users must open the sidebar to know if they have running or failed jobs. A live `3 running · 1 failed` count in the status bar provides ambient awareness without any navigation — the same pattern used by Git indicators, language servers, and CI plugins.

## What Changes

Add a second `StatusBarItem` (priority after the context item) updated after every `JobTreeProvider.refresh()`:
- Label: `$(play) 3  $(error) 1  $(clock) 12` using inline codicons
- Tooltip: breakdown by queue or job set
- Click action: `armada.filterByState` filtered to FAILED (the most actionable state)
- Update method: count from `JobTreeProvider.jobs` in-memory map (no extra API call)

Gated behind `armada.statusBar.showJobCounts` setting (default: true).

## Perspectives

**Job Submitter**: Medium daily value. A persistent "3 running / 2 failed" indicator reduces the compulsion to constantly poll the sidebar. The count should be clickable to jump to filtered failed jobs. Updates on the existing refresh cadence — no new polling needed.

**VS Code Extension**: Count by iterating `jobTreeProvider.jobs` — add a `getJobCounts(): Map<JobState, number>` getter. Update from `JobTreeProvider.refresh()` callback. Use inline codicons in the status bar label (`$(play)`, `$(error)`, `$(clock)`). Read interval setting once at activation — do not call `getConfiguration` in the refresh hot-path.

**DevSecOps**: The status bar persists across all workspace tabs. Ensure it clearly indicates which context/cluster it refers to — operators in multi-cluster environments must not conflate counts from different clusters. Confirm the refresh interval is configurable with a conservative minimum (30s); the existing 5s tree refresh should not translate to 5s status bar API polling. Counts sourced from the in-memory job map (not additional API calls) avoids rate-limit risk.

**Armada Developer**: No new API calls needed — counts are derived from the already-loaded in-memory `JobTreeProvider.jobs` map. If the extension is extended to use Lookout for status bar counts, query Lookout v2 with `take=1` per state filter to get total counts from the response metadata. Poll at a conservative interval (30s minimum) to avoid rate-limiting.

## Security Considerations

- Status bar must label which context/cluster the counts belong to in its tooltip
- Job counts sourced from in-memory map — no additional API calls at the status bar refresh rate
- Configurable `armada.statusBar.showJobCounts` allows disabling on shared/screen-shared machines

## Capabilities

### New Capabilities

- `status-bar-job-counts`: Live running/failed/queued counts in VS Code status bar

### Modified Capabilities

- `jobTreeProvider`: Expose `getJobCounts()` getter for status bar consumption

## Impact

- `src/extension.ts` — register second `StatusBarItem`, wire to `jobTreeProvider` refresh
- `src/providers/jobTreeProvider.ts` — add `getJobCounts(): Record<JobState, number>` method
- `package.json` — add `armada.statusBar.showJobCounts` boolean setting (default: true)
