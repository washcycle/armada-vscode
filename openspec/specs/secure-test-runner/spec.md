# secure-test-runner Specification

## Purpose
TBD - created by archiving change fix-serialize-javascript-rce. Update Purpose after archive.
## Requirements
### Requirement: mocha devDependency ships patched serialize-javascript
The project's mocha devDependency SHALL resolve to a version that ships `serialize-javascript` ≥7.0.3, closing CVE-2024-11831.

#### Scenario: No vulnerable serialize-javascript in dependency tree
- **WHEN** `npm ls serialize-javascript` is run
- **THEN** all resolved versions SHALL be ≥7.0.3

#### Scenario: Unit tests pass under mocha v11
- **WHEN** `npm run test:unit` is executed
- **THEN** all unit tests SHALL pass with exit code 0

#### Scenario: Dependabot alert #18 is resolved
- **WHEN** the updated package-lock.json is pushed to main
- **THEN** GitHub Dependabot alert #18 SHALL be in `fixed` or `dismissed` state

