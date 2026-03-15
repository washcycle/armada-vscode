## Context

Three GitHub Actions workflow files use action versions that run on Node.js 20 internally. GitHub will deprecate Node.js 20 action runners on June 2, 2026. The affected actions and their current/target versions:

| Action | Current | Target | Files |
|--------|---------|--------|-------|
| `actions/setup-node` | `@v4` | `@v5` | ci.yml, publish.yml, integration-tests.yml |
| `actions/upload-artifact` | `@v4` | `@v5` | ci.yml |
| `actions/checkout` | `@v4` | `@v5` | publish.yml, integration-tests.yml |

`ci.yml` already uses `actions/checkout@v5`.

## Goals / Non-Goals

**Goals:**
- Eliminate Node.js 20 deprecation warnings in all three workflows
- All action versions run on Node.js 22 runners

**Non-Goals:**
- Upgrading the Node.js version used to build/test the extension (stays at 20)
- Any changes to build scripts, tests, or extension code

## Decisions

**Upgrade to exact major version pins (`@v5`) not SHA pins.**
Rationale: The project already uses major-version pins (`@v4`, `@v5`) throughout. Consistency matters more than pinning to a specific patch for these low-risk CI housekeeping actions. No alternative considered — this matches the existing convention.

**Keep `node-version: 20` in setup-node.**
The deprecation is about the action's own Node.js runtime, not the Node.js version it installs. The extension is tested against Node.js 20 and that stays unchanged.

## Risks / Trade-offs

- **[Breaking API change in v5]** `actions/upload-artifact@v5` or `actions/setup-node@v5` could have breaking changes → Mitigation: both have stable v5 releases; CI will catch failures immediately
- **[publish.yml still uses xvfb + old test runner]** That workflow has other technical debt (xvfb-run, continue-on-error tests) — those are out of scope here
