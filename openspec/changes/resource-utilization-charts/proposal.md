## Why

Users submit jobs with resource requests that are often over- or under-specified — too much memory wastes capacity, too little causes OOM failures. Visualizing requested resources alongside job duration (and actual utilization events where available) helps users tune their requests over time without needing a separate Grafana dashboard.

## What Changes

Add `armada.showResourceChart` command accessible from the `JobItem` context menu, opening a `WebviewPanel` with:
- Horizontal bar chart: requested CPU, memory, GPU per container
- Run duration bar (wall-clock time from `started_ts` to `finished_ts` from `JobRunDetails`)
- Utilization events overlay if `JobUtilisationEvent` data is available from the event stream (avg/max CPU, memory per period)

All charting via inline SVG — no external JS libraries to avoid CSP and bundle size issues.

**Important label requirement**: display as "requested resources" not "actual utilization" unless `JobUtilisationEvent` data is present, to avoid misleading operators.

## Perspectives

**Job Submitter**: Low daily need — useful for tuning over time, not blocking. A small sparkline integrated into the job detail panel is preferable to a separate WebView that takes time to load. Requested vs actual side-by-side would be the ideal end state once utilization events are reliably available.

**VS Code Extension**: `WebviewPanel` with inline SVG `<rect>` elements — ~50 lines of TypeScript template literal, no charting library. Use VS Code CSS variables for colors. Avoid Chart.js / D3 in the extension bundle — they add significant VSIX size. `getJobDetails` with `expand_job_spec=true` gives requested resources. Event stream replay gives `JobUtilisationEvent` data for actual usage.

**DevSecOps**: WebView CSP/XSS surface identical to `job-detail-panel`. All JS dependencies must be bundled — no external CDN loads (violates proper CSP). Resource utilization data may not be available for all jobs or clusters. Require graceful degradation when data is absent. No external resource loads in the WebView. Strict CSP required.

**Armada Developer**: `JobUtilisationEvent` in the event stream carries `MaxResourcesForPeriod`, `AvgResourcesForPeriod`, and `total_cumulative_usage` maps (CPU, memory, GPU) as Kubernetes `Quantity` proto messages. Replay `Event.GetJobSetEvents` with `watch=false` to collect utilisation events for a job. Caveat: `JobUtilisationEvent` is emitted periodically during execution and may not exist for short-lived jobs. Kubernetes `Quantity` values arrive as strings (due to proto-loader options) — parse with a k8s quantity parser. Requested resources from `job_spec.scheduling_resource_requirements` via `GetJobDetails`.

## Security Considerations

- Strict CSP: `default-src 'none'; style-src 'unsafe-inline'`
- No external JS libraries — all charting via inline SVG in TypeScript template literals
- No CDN resource loads — strict CSP prohibits them
- Graceful degradation when utilization data is unavailable — show requested-only chart, labeled accurately
- Label all displayed values clearly: "requested" vs "actual" to prevent capacity planning confusion

## Capabilities

### New Capabilities

- `resource-utilization-charts`: SVG-based resource visualization showing requested and (where available) actual usage per job

## Impact

- `src/panels/resourceChartPanel.ts` — new file: WebView panel with SVG chart generation
- `package.json` — register `armada.showResourceChart` command on job context menu
- `src/grpc/armadaClient.ts` — event stream replay for `JobUtilisationEvent` collection
