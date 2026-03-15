## ADDED Requirements

### Requirement: Claim beads issue when starting a task
The apply skill SHALL run `bd update <issue-id> --claim` when beginning work on a task.

#### Scenario: Task claimed on start
- **WHEN** the apply skill starts implementing a task
- **THEN** the corresponding `bd` issue SHALL be claimed before any code changes are made

### Requirement: Close beads issue when completing a task
The apply skill SHALL run `bd close <issue-id>` when a task is completed, alongside toggling the checkbox in tasks.md.

#### Scenario: Task closed on completion
- **WHEN** the apply skill marks a task as `- [x]` in tasks.md
- **THEN** the corresponding `bd` issue SHALL be closed

### Requirement: Use bd ready for task selection
The apply skill SHALL consult `bd ready` to determine which tasks are unblocked and available for work.

#### Scenario: Only unblocked tasks are worked on
- **WHEN** the apply skill selects the next task to implement
- **THEN** it SHALL prefer tasks that appear in `bd ready` output

#### Scenario: Blocked tasks are skipped
- **WHEN** a task has unresolved `bd` dependencies
- **THEN** the apply skill SHALL skip it and work on the next ready task

### Requirement: Graceful fallback without beads
The apply skill SHALL fall back to the default checkbox-only behavior if `bd` is not available.

#### Scenario: bd not installed
- **WHEN** `bd` is not found in PATH
- **THEN** the apply skill SHALL proceed with checkbox-only tracking and log a warning
