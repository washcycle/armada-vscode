## 1. Propose Skill — Beads Sync Step

- [x] 1.1 Add beads sync instructions to openspec-propose SKILL.md: after tasks.md is created, parse each `- [ ]` line and run `bd create` for each task with the change name in the description
- [x] 1.2 Add dependency wiring instructions: after all issues are created, run `bd dep add` to link last task of group N to first task of group N+1
- [x] 1.3 Add idempotency check: before creating, check `bd list --json` for existing issues matching the task description and skip duplicates
- [x] 1.4 Add bd availability guard: wrap all bd commands in a `command -v bd` check with a fallback warning message

## 2. Apply Skill — Beads Tracking

- [x] 2.1 Add bd availability check at the start of the apply skill with graceful fallback to checkbox-only mode
- [x] 2.2 Add `bd ready` consultation when selecting the next task to implement, preferring unblocked tasks
- [x] 2.3 Add `bd update --claim` step when starting work on a task
- [x] 2.4 Add `bd close` step alongside checkbox toggling when completing a task

## 3. Verification

- [x] 3.1 Test the propose flow end-to-end: create a test change, generate tasks, verify bd issues are created with correct dependencies
- [x] 3.2 Test the apply flow: implement a task, verify both checkbox and bd issue are updated
- [x] 3.3 Test graceful fallback: temporarily remove bd from PATH and verify propose/apply still work with checkbox-only mode
