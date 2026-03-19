## Why

Understanding how long a job spent in each phase (queued vs pending vs running) is essential for diagnosing scheduling latency vs slow startup vs actual compute time. This data exists in Armada's event stream but is never visualized — users must mentally reconstruct a timeline from log timestamps in the Lookout UI.

## What Changes

Add an `armada.showTimeline` command accessible from the `JobItem` context menu (or as a tab in the `job-detail-panel` WebView). The panel replays `Event.GetJobSetEvents` with `watch=false` filtered to the specific job ID, collects state-transition events with their `created` timestamps, and renders a horizontal Gantt-style timeline:

```
[Queued 2m] → [Pending 45s] → [Running 1h 23m] → Failed
```

Use inline SVG with `<rect>` elements — no charting library needed, no CSP issues.

## Perspectives

**Job Submitter**: Medium value alone, but becomes the go-to debugging tool when combined with failure-reason-display. "Why did this job take 2h?" is answered at a glance. The horizontal timeline with timestamps at each transition is the ideal format — not a separate chart, integrated into the job detail panel.

**VS Code Extension**: Implement as a `WebviewPanel` reusing infrastructure from `job-detail-panel`. Post run data via `postMessage`. Use SVG `<rect>` elements keyed to relative timestamps — trivial to render, no bundle size impact, no CSP issues. Consider registering as a tab within the job detail panel rather than a standalone command to reduce command palette clutter.

**DevSecOps**: WebView XSS surface — same requirements as `job-detail-panel`. Job event data flows from `convertEventFromProto()` which spreads the entire `eventData` object. Require explicit field allow-listing when passing event data into the WebView (no object spreading into the postMessage payload). Timestamps must be server-sourced, strict CSP required.

**Armada Developer**: Replay `Event.GetJobSetEvents` with `watch=false` and `from_message_id=''` for full history, then filter client-side by `job_id`. State-transition events to capture: `queued`, `leased`, `pending`, `running`, `succeeded`/`failed`/`preempted`/`cancelled` — each carries a `created` timestamp. For large job sets, the event stream may be voluminous — apply client-side filter early and consider a `from_message_id` cursor for pagination.

## Security Considerations

- Strict CSP on WebView: `default-src 'none'; style-src 'unsafe-inline'`
- Explicit field allow-list for postMessage payload (no object spreading)
- All string values from event data HTML-escaped
- Timestamps sourced from server-side event `created` field, not local time

## Capabilities

### New Capabilities

- `job-event-timeline`: Visual phase timeline for a selected job showing time spent in each state

## Impact

- `src/panels/jobTimelinePanel.ts` — new file (or integrated as tab in `jobDetailPanel.ts`)
- `package.json` — register `armada.showTimeline` command on job context menu
- `src/grpc/armadaClient.ts` — ensure historical event stream replay (watch=false) is supported
