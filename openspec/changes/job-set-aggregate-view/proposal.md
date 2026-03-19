## Why

When a sweep of 20 jobs runs, the first thing an operator wants to know is: 17 succeeded, 2 failed, 1 still running. Currently, the job set tree node shows only the total job count label. Users must expand every job set and visually scan individual job nodes to understand the aggregate outcome.

## What Changes

Extend `JobSetItem` to display per-state counts in its tree node `description` and `tooltip`:
- `description`: `✓ 17  ✗ 2  ▷ 1` using codicons `$(pass)`, `$(error)`, `$(play)`
- `tooltip`: `MarkdownString` table with exact counts per state
- Source: aggregate `JobSetItem.jobs` in-memory array — no new API calls

The `updateJobCount()` method already exists — extend it to count by state bucket.

## Perspectives

**Job Submitter**: High value for P4 — this is the first thing checked after submitting a sweep. The job set node showing `17/2/1` with color coding makes the summary immediately legible without expanding. Individual job expansion remains available for drill-down.

**VS Code Extension**: Entirely within existing `TreeDataProvider` — no new API surface. Extend `JobSetItem.updateJobCount()` to iterate `this.jobs` and count by `jobInfo.state`. Set `description` with inline codicon counts. Override `tooltip` as `vscode.MarkdownString` with a formatted table. These counts stay live because `handleJobEvent` already calls `updateDisplay()` and `updateJobCount()` on state changes. Use `ThemeColor` values (`charts.green`, `charts.red`, `charts.blue`) for visual state differentiation.

**DevSecOps**: Low individual risk. Aggregate counts drive increased Lookout API call volume if sourced from Lookout rather than the in-memory map. This feature is blocked on `fix-browse-job-sets-url` if Lookout is used as the data source. Sourcing from the in-memory `JobSetItem.jobs` array is preferred — zero additional API calls. Ensure the aggregate view does not imply completeness if only a subset of jobs are loaded into the tree.

**Armada Developer**: Source from the in-memory `JobSetItem.jobs` array — counts are already available from the event stream. If querying Lookout v2 for accuracy (for job sets with more jobs than loaded), use `POST /api/v1/jobs?backend=jsonb` with a `jobSet` filter and aggregate client-side. Paginate with `skip` for sets >1000 jobs. Display a `~` prefix on counts when loaded from Lookout with pagination (not fully accurate) vs. the in-memory stream.

## Security Considerations

- Blocked on `fix-browse-job-sets-url` if Lookout is used as the source
- If sourced from in-memory map, add a visual indicator if not all jobs are loaded (partial view)
- No new API calls when sourced from in-memory — zero additional security surface

## Capabilities

### Modified Capabilities

- `jobTreeProvider`: `JobSetItem.updateJobCount()` computes and displays per-state aggregate counts

## Impact

- `src/providers/jobTreeProvider.ts` — extend `updateJobCount()` with per-state bucketing, update `description` and `tooltip` on `JobSetItem`
- No new files required
