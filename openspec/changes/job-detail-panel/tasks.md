# Tasks: job-detail-panel

- [x] Create `src/panels/jobDetailPanel.ts` with `createWebviewPanel` and strict CSP
- [x] Fetch job details via `getJobDetails(jobId, expandJobRun=true, expandJobSpec=true)`
- [x] Build HTML template using VS Code CSS variables for theme compatibility (no external frameworks)
- [x] Render: job identity, state + time-in-state, resource requests, run history table
- [x] Add explicit field allow-list for `postMessage` payload (no object spreading)
- [x] Wire `armada.viewJobDetails` command to open panel on `JobItem` click/context menu
- [x] Register command in `src/extension.ts` and `package.json` with `viewItem == job` context
