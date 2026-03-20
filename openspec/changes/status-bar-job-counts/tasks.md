## 1. Configuration

- [x] 1.1 Add `armada.statusBar.showJobCounts` boolean setting (default: true) to `package.json` contributes.configuration

## 2. JobTreeProvider

- [x] 2.1 Add `getJobCounts(): Record<string, number>` method to `JobTreeProvider` that counts jobs by state from the in-memory map (no API calls)

## 3. Status Bar Item

- [x] 3.1 Register a second `StatusBarItem` in `extension.ts` after the context item
- [x] 3.2 Implement label builder: codicon format `$(play) N  $(error) N  $(clock) N` with zero-count suppression
- [x] 3.3 Set tooltip to show active context name and per-state breakdown
- [x] 3.4 Wire click action to `armada.filterByState` with `FAILED`
- [x] 3.5 Update status bar counts after every `JobTreeProvider.refresh()` call
- [x] 3.6 Hide/show item based on `armada.statusBar.showJobCounts` setting

## 4. Tests

- [x] 4.1 Unit test `getJobCounts()` — empty map, mixed states, zero suppression
- [x] 4.2 Unit test label builder function — correct codicon format, zero suppression
