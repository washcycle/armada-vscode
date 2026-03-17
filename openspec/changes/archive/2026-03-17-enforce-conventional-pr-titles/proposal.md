## Why

PRs #39, #40, and #41 were merged with non-conventional commit titles (e.g. `Fix gRPC credential selection` instead of `fix: gRPC credential selection`), making them invisible to release-please. As a result, no 0.2.4 release PR has been created despite meaningful fixes landing. With Copilot-authored PRs increasingly common, this gap needs automated enforcement.

## What Changes

- Add a GitHub Actions workflow that validates PR titles conform to the Conventional Commits specification before merge is allowed
- Push an empty conventional commit to retroactively trigger release-please for the work merged in PRs #39–#41

## Capabilities

### New Capabilities

- `pr-title-validation`: Automated check that blocks PR merge if the title does not follow the `type(scope): description` conventional commits format

### Modified Capabilities

<!-- None — no existing spec-level requirements are changing -->

## Impact

- `.github/workflows/semantic-pr.yml`: new workflow file
- No production code changes
- Developers (and Copilot) must use conventional PR titles; non-conforming PRs will fail the required check
- One-time empty commit pushed to `main` to unblock the current release cycle
