## Why

OpenSpec's task tracking uses markdown checkboxes in tasks.md, which works but lacks dependency awareness, priority, status audit trails, and agent-friendly querying. The beads (`bd`) tool is already initialized in this project and provides all of these. Integrating beads as a tracking layer alongside tasks.md gives us richer task management without breaking OpenSpec's existing artifact pipeline.

## What Changes

- Modify the **propose skill** (`.github/skills/openspec-propose/SKILL.md`) to add a post-tasks step that syncs tasks.md entries into `bd` issues with `bd create`
- Modify the **apply skill** (`.github/skills/openspec-apply-change/SKILL.md`) to claim tasks with `bd update --claim` when starting and `bd close` when completing, alongside existing checkbox toggling
- Add **dependency wiring** so sequential task groups use `bd dep add` to express ordering
- tasks.md remains the source of truth; beads mirrors it as a tracking layer

## Capabilities

### New Capabilities
- `beads-task-sync`: Syncing tasks.md checkbox entries into beads issues after task artifact generation
- `beads-task-tracking`: Claiming and closing beads issues during the apply phase alongside checkbox toggling

### Modified Capabilities

## Impact

- `.github/skills/openspec-propose/SKILL.md` — new step after tasks artifact creation
- `.github/skills/openspec-apply-change/SKILL.md` — additional bd commands in the task implementation loop
- Requires `bd` CLI to be installed and initialized (`bd init` already done)
- No changes to the OpenSpec schema itself or to application source code
