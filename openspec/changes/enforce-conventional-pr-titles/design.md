## Context

Release-please parses commit messages on `main` using the Conventional Commits spec (`type(scope): description`). When PRs are squash-merged, the PR title becomes the commit message. PRs #39–#41 were merged with plain English titles, so release-please sees no releasable commits since 0.2.3.

The project uses `googleapis/release-please-action@v4` with a `GH_RELEASE_TOKEN` PAT. Copilot is actively opening PRs on `copilot/*` branches, making human title review unreliable.

## Goals / Non-Goals

**Goals:**
- Block merge of any PR whose title does not pass the Conventional Commits format check
- Retroactively trigger release-please so a 0.2.4 PR is created for the work already merged

**Non-Goals:**
- Enforcing scope (e.g. `fix(auth):`) — bare `fix:` is acceptable
- Linting commit messages on branches (only PR title matters for squash merge)
- Changing the release-please configuration itself

## Decisions

### Use `amannn/action-semantic-pull-request` for validation

**Decision**: Add a workflow using `amannn/action-semantic-pull-request@v5` that runs on `pull_request_target` (title/label changes) and sets a required status check.

**Rationale**: This action is the standard, actively maintained solution. It validates the exact same spec that release-please consumes, supports configuration of allowed types, and produces a clear failure message citing the offending title. Alternatives like regex matching in a shell step are fragile and harder to maintain.

**Allowed types** (aligned with `release-please-config.json`): `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`.

### Retroactive trigger via empty commit

**Decision**: Push a single `git commit --allow-empty -m "chore: trigger release for #39 #40 #41"` directly to `main`.

**Rationale**: This is the standard release-please escape hatch. It creates a real commit that release-please will process, causing it to open a 0.2.4 release PR that includes all three prior fixes in the changelog. No manifest edits needed.

## Risks / Trade-offs

- **Copilot PR titles may fail the check** → Copilot will need to be guided (or PRs retitled by the reviewer before merge). This is the desired behavior.
- **`pull_request_target` event scope** → Required to read PR metadata from forks. The action is read-only so the elevated permissions are safe.
- **Empty commit in history** → Minor noise, but this is standard practice for release-please recovery and is self-documenting via commit message.

## Migration Plan

1. Add `.github/workflows/semantic-pr.yml`
2. In GitHub repo settings → Branches → `main` branch protection rule, add `Semantic PR title` as a required status check
3. Push the empty commit to `main` to trigger the pending release
4. Verify release-please opens a 0.2.4 PR
