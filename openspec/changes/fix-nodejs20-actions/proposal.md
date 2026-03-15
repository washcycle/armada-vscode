## Why

GitHub Actions is deprecating the Node.js 20 runner used internally by several actions on June 2, 2026. Three workflow files pin action versions that use Node.js 20 and will trigger deprecation warnings (and eventually break) without an upgrade.

## What Changes

- Upgrade `actions/setup-node@v4` → `@v5` in `ci.yml`, `publish.yml`, and `integration-tests.yml`
- Upgrade `actions/upload-artifact@v4` → `@v5` in `ci.yml`
- Upgrade `actions/checkout@v4` → `@v5` in `publish.yml` and `integration-tests.yml` (already `@v5` in `ci.yml`)

## Capabilities

### New Capabilities

- `github-actions-node22`: CI/CD workflows run on Node.js 22 action runners, eliminating Node.js 20 deprecation warnings

### Modified Capabilities

<!-- none — no spec-level behavior changes, purely version bumps -->

## Impact

- `.github/workflows/ci.yml`: 2 action version bumps
- `.github/workflows/publish.yml`: 3 action version bumps
- `.github/workflows/integration-tests.yml`: 2 action version bumps
- No changes to extension code, tests, or build logic
