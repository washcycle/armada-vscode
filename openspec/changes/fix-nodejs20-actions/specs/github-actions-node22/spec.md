## ADDED Requirements

### Requirement: CI workflows use Node.js 22 action runners
All GitHub Actions workflows SHALL use action versions that run on Node.js 22 internally, eliminating Node.js 20 deprecation warnings.

#### Scenario: ci.yml produces no Node.js 20 deprecation annotations
- **WHEN** a pull request triggers the CI workflow
- **THEN** the workflow SHALL complete with no Node.js 20 deprecation warnings from any action

#### Scenario: publish.yml produces no Node.js 20 deprecation annotations
- **WHEN** a release triggers the publish workflow
- **THEN** the workflow SHALL complete with no Node.js 20 deprecation warnings from any action

#### Scenario: integration-tests.yml produces no Node.js 20 deprecation annotations
- **WHEN** the nightly integration test workflow runs
- **THEN** the workflow SHALL complete with no Node.js 20 deprecation warnings from any action

#### Scenario: Extension still builds against Node.js 20
- **WHEN** any workflow runs the build or test steps
- **THEN** the extension SHALL be compiled and tested using Node.js 20 (the installed version is unchanged)
