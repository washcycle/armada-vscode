# Tasks: time-in-state

- [x] Add `stateEnteredAt?: Date` field to `JobInfo` in `src/types/armada.ts`
- [x] Update `stateEnteredAt` in `JobTreeProvider.updateJobState()` when state changes
- [x] Add `formatElapsed(date: Date): string` helper that formats as "1h 23m", "45s", etc.
- [x] Show elapsed time in `JobItem.updateDisplay()` as `TreeItem.description` alongside state label
