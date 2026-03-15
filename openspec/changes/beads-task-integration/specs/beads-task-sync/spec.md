## ADDED Requirements

### Requirement: Sync tasks to beads after generation
The propose skill SHALL create a `bd` issue for each checkbox task in tasks.md after the tasks artifact is generated.

#### Scenario: Tasks synced to beads
- **WHEN** the propose skill finishes creating tasks.md
- **THEN** each `- [ ]` entry in tasks.md SHALL have a corresponding `bd` issue created with the task description as the issue title

#### Scenario: Task groups create dependencies
- **WHEN** tasks.md contains numbered groups (e.g., `## 1. Setup`, `## 2. Core`)
- **THEN** the first task of each group SHALL be marked as blocked by the last task of the previous group using `bd dep add`

#### Scenario: Beads issues use change name as context
- **WHEN** a `bd` issue is created from a task
- **THEN** the issue description SHALL include the change name for traceability

### Requirement: Sync is idempotent
The sync step SHALL not create duplicate issues if run multiple times for the same tasks.md.

#### Scenario: Re-running sync on existing tasks
- **WHEN** the sync step runs and bd issues already exist for the tasks
- **THEN** no duplicate issues SHALL be created
