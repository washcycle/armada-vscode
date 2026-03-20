## Context

The extension already maintains a `JobTreeProvider` with an in-memory `jobs` map populated on every refresh. The status bar currently shows only the active context name via a single `StatusBarItem`. Users must open the sidebar to discover job state at a glance.

## Goals / Non-Goals

**Goals:**
- Add a second `StatusBarItem` showing live counts: running, failed, queued
- Derive counts from `JobTreeProvider.jobs` (no new API calls)
- Update counts after every existing `JobTreeProvider.refresh()`
- Gate behind `armada.statusBar.showJobCounts` setting (default: true)
- Tooltip shows per-queue breakdown; click filters sidebar to FAILED jobs

**Non-Goals:**
- No independent polling loop for the status bar
- No Lookout v2 integration (future work)
- No per-cluster breakdown in the label (tooltip only)

## Decisions

**D1: Source counts from in-memory map, not extra API calls**
`JobTreeProvider` already holds the full job list after each refresh. Adding a `getJobCounts(): Record<string, number>` getter costs O(n) over an already-loaded dataset. Alternative (extra Lookout API call) would add latency and rate-limit risk. → Use in-memory getter.

**D2: Update hook via refresh callback, not an event emitter**
`extension.ts` already owns the refresh wiring. Passing the status bar item into the refresh callback is the simplest integration. Alternative (EventEmitter in JobTreeProvider) adds complexity for no gain here. → Callback in extension.ts.

**D3: Second StatusBarItem, not mutating the first**
The context item has a fixed role (click = switchContext). Combining counts into it would make the tooltip and click action ambiguous. → Separate item with its own priority slot.

**D4: Codicon label format**
`$(play) N  $(error) N  $(clock) N` matches VS Code conventions (Git, ESLint). Zero-counts are suppressed to reduce noise (e.g. when no failed jobs, `$(error)` is omitted).

## Risks / Trade-offs

- [Stale counts] Counts only update on refresh, not on external job state changes → Mitigation: existing refresh interval (configurable) already governs tree staleness; status bar inherits same cadence.
- [Multi-cluster ambiguity] Counts span all jobs in the in-memory map, which may include jobs from multiple clusters → Mitigation: tooltip labels which context the counts belong to.

## Migration Plan

1. Add `getJobCounts()` to `JobTreeProvider`
2. Add `armada.statusBar.showJobCounts` to `package.json` contributes.configuration
3. Register second `StatusBarItem` in `extension.ts`, wire to refresh
4. No rollback needed; setting defaults to true but can be toggled off
