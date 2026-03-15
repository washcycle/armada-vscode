## Context

OpenSpec skills are defined as markdown SKILL.md files in `.github/skills/`. They contain instructions that Claude follows when invoked. Currently:
- `openspec-propose/SKILL.md` generates artifacts including tasks.md with `- [ ]` checkboxes
- `openspec-apply-change/SKILL.md` reads tasks.md, implements tasks, and toggles checkboxes

Beads (`bd`) is initialized in this project at `.beads/` and provides issue tracking with dependencies, priorities, and status tracking via a Dolt-backed database.

## Goals / Non-Goals

**Goals:**
- Add beads issue creation as a post-step in the propose skill
- Add beads claim/close commands in the apply skill's task loop
- Use `bd ready` to inform task ordering during apply
- Maintain tasks.md as the canonical source of truth
- Graceful degradation when `bd` is unavailable

**Non-Goals:**
- Replacing tasks.md with beads as the source of truth
- Modifying the OpenSpec schema (schema.yaml stays untouched)
- Building a two-way sync (beads → tasks.md)
- Adding a UI or dashboard for beads tracking

## Decisions

### 1. Skill files only — no schema changes
**Decision**: Modify only the SKILL.md files, not the spec-driven schema.yaml.

**Rationale**: The schema defines artifact structure and dependencies. Task tracking is an operational concern handled by skill instructions, not schema structure. This keeps the integration removable — delete the bd lines from SKILL.md to revert.

**Alternative considered**: Forking the schema to add a "beads-sync" artifact. Rejected because it adds schema complexity for what is essentially a side-effect, not an artifact.

### 2. Parse tasks.md to create bd issues
**Decision**: After tasks.md is written, parse `- [ ] X.Y Description` lines and run `bd create "Description" -d "Change: <name>, Task: X.Y"` for each.

**Rationale**: Simple text parsing of a well-defined format. The task numbering (X.Y) provides a natural key for idempotency checks and dependency wiring.

### 3. Group-level dependencies only
**Decision**: Wire `bd dep add` between the last task of group N and the first task of group N+1 (e.g., task 1.3 blocks task 2.1).

**Rationale**: Task-level dependencies within a group are usually implicit (do them in order). Cross-group dependencies capture the meaningful sequencing without over-constraining.

### 4. Idempotency via description matching
**Decision**: Before creating a bd issue, check `bd list --json` for an existing issue whose title matches the task description. Skip if found.

**Rationale**: Simple and sufficient. The task descriptions in tasks.md are unique within a change.

### 5. Graceful fallback
**Decision**: Wrap all `bd` commands in a check (`command -v bd`). If bd is missing, log a note and proceed with checkbox-only behavior.

**Rationale**: The integration should be additive. A missing tool shouldn't break the workflow.

## Risks / Trade-offs

- **[Drift]** If someone manually edits tasks.md without re-syncing, beads issues will be stale → Mitigation: tasks.md is source of truth; beads is advisory. Stale beads issues don't block work.
- **[Complexity]** Two places to look for task status → Mitigation: The apply skill always updates both simultaneously. tasks.md is the canonical view.
- **[bd availability]** bd must be installed and initialized → Mitigation: Graceful fallback to checkbox-only mode.
