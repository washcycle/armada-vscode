## ADDED Requirements

### Requirement: Status bar displays live job counts
The extension SHALL display a second `StatusBarItem` showing running, failed, and queued job counts using inline codicons. Zero counts SHALL be suppressed. The item SHALL only be shown when `armada.statusBar.showJobCounts` is `true` and the extension is configured.

#### Scenario: Counts shown with running and failed jobs
- **WHEN** `JobTreeProvider` has 3 running and 1 failed job
- **THEN** status bar label shows `$(play) 3  $(error) 1`

#### Scenario: Zero counts suppressed
- **WHEN** there are no failed jobs
- **THEN** `$(error)` segment is omitted from the label

#### Scenario: Setting disabled
- **WHEN** `armada.statusBar.showJobCounts` is `false`
- **THEN** the job count status bar item is hidden

### Requirement: Status bar tooltip shows context and per-queue breakdown
The job count `StatusBarItem` tooltip SHALL identify the active context and list counts per state.

#### Scenario: Tooltip content
- **WHEN** user hovers the job count status bar item
- **THEN** tooltip shows the active context name and a breakdown of counts by state

### Requirement: Clicking status bar filters to failed jobs
The job count `StatusBarItem` click action SHALL execute `armada.filterByState` with `FAILED` as the argument.

#### Scenario: Click action
- **WHEN** user clicks the job count status bar item
- **THEN** `armada.filterByState` is executed with state `FAILED`

### Requirement: Counts update after every refresh
Job counts SHALL update after every `JobTreeProvider.refresh()` completes, with no additional API calls.

#### Scenario: Count update on refresh
- **WHEN** `JobTreeProvider.refresh()` completes
- **THEN** the status bar item label reflects the current in-memory job counts
