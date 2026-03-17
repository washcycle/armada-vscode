# Agent Guide for armada-vscode

This file provides guidance for AI coding agents (GitHub Copilot, Claude, etc.) and human contributors working on this repository.

## PR Title Convention

**All pull request titles MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) format:**

```
type(scope): short description
```

- `scope` is optional
- Breaking changes: append `!` after the type/scope (e.g. `feat!: drop Node 18`)
- Description should be lowercase and not end with a period

### Allowed Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `chore` | Maintenance, dependency updates, tooling |
| `docs` | Documentation only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `perf` | Performance improvement |
| `build` | Changes to build system or external dependencies |
| `ci` | Changes to CI/CD configuration |
| `style` | Formatting, whitespace (no logic change) |
| `revert` | Reverting a previous commit |

### Examples

```
fix: correct gRPC TLS credential selection
feat: add job cancellation support
chore: update serialize-javascript to patch CVE-2024-11831
ci: add semantic PR title validation
feat!: remove deprecated REST transport
```

### Why This Matters

This project uses [release-please](https://github.com/googleapis/release-please) to automate changelogs and versioning. Release-please reads commit messages (which come from squash-merged PR titles) to determine the next version and generate the changelog. **A PR with a non-conventional title is invisible to release-please** — it won't appear in the changelog and won't trigger a release.

### Enforcement

The `Semantic PR title` GitHub Actions check is **required** on `main`. PRs with non-conventional titles cannot be merged until the title is corrected.
