## ADDED Requirements

### Requirement: PR title must follow Conventional Commits format
Every pull request targeting `main` SHALL have a title that conforms to the Conventional Commits specification (`type(scope)!: description` where scope and `!` are optional). The CI check SHALL fail and block merge if the title does not conform.

#### Scenario: Valid conventional title passes
- **WHEN** a PR is opened or retitled with a title like `fix: correct gRPC TLS selection`
- **THEN** the `Semantic PR title` status check passes and merge is not blocked by this check

#### Scenario: Non-conventional title is blocked
- **WHEN** a PR is opened or retitled with a title like `Fix gRPC credential selection`
- **THEN** the `Semantic PR title` status check fails with a message indicating the title does not conform to Conventional Commits

#### Scenario: Allowed types are enforced
- **WHEN** a PR title uses a type outside the allowed set (e.g. `wip: rough draft`)
- **THEN** the status check fails

#### Scenario: Breaking change marker is supported
- **WHEN** a PR title uses the breaking change marker (e.g. `feat!: drop Node 18 support`)
- **THEN** the status check passes

### Requirement: Conventional commit conventions are documented for agents and contributors
The repository SHALL contain an `AGENT.md` file at the root that documents the PR title convention, allowed types, and the reason enforcement exists, so that AI coding agents (Copilot, Claude) and human contributors have a single authoritative reference.

#### Scenario: Agent reads AGENT.md before opening a PR
- **WHEN** an AI agent or contributor prepares a PR
- **THEN** they can find the PR title convention documented in `AGENT.md` at the repo root

#### Scenario: AGENT.md lists allowed conventional commit types
- **WHEN** a contributor reads `AGENT.md`
- **THEN** they see the full list of allowed types (feat, fix, chore, docs, refactor, test, perf, build, ci, style, revert)
