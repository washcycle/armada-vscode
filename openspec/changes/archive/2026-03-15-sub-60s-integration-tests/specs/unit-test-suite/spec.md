## ADDED Requirements

### Requirement: Unit test runner executes without VS Code
Unit tests SHALL run as plain Mocha tests via `npm run test:unit` without requiring `@vscode/test-electron` or a VS Code instance.

#### Scenario: Unit tests run standalone
- **WHEN** `npm run test:unit` is executed
- **THEN** Mocha SHALL run all test files in `out/test/unit/` without spawning VS Code

#### Scenario: Unit tests complete in under 30 seconds
- **WHEN** `npm run test:unit` is executed on CI
- **THEN** the test suite SHALL complete in under 30 seconds including compilation

### Requirement: gRPC client tests verify proto serialization
Tests SHALL verify that `ArmadaClient` correctly constructs protobuf messages and handles responses using the mock gRPC server.

#### Scenario: Job submission sends correct proto format
- **WHEN** `ArmadaClient.submitJobs()` is called with a job spec
- **THEN** the mock server SHALL receive a request with `queue`, `job_set_id`, and `job_request_items` fields matching the input

#### Scenario: Event stream converts proto to TypeScript objects
- **WHEN** `ArmadaClient.streamJobSetEvents()` receives events from the mock server
- **THEN** the callback SHALL receive `JobEventMessage` objects with `jobId`, `jobSetId`, `queue`, and `event.type` fields

#### Scenario: Job cancellation sends correct request
- **WHEN** `ArmadaClient.cancelJob()` is called
- **THEN** the mock server SHALL receive a request with `job_id`, `job_set_id`, and `queue` fields

#### Scenario: Queue listing returns parsed results
- **WHEN** `ArmadaClient.getAllQueues()` is called
- **THEN** it SHALL return an array of queue objects from the mock server's stream response

### Requirement: Configuration tests verify config resolution
Tests SHALL verify that `ConfigManager` resolves Armada configuration from YAML files correctly.

#### Scenario: Config loads from fixture file
- **WHEN** `ConfigManager` is initialized with the test config fixture
- **THEN** it SHALL resolve the `armadaUrl`, `binocularsUrl`, and context name correctly

#### Scenario: Config handles missing file gracefully
- **WHEN** `ConfigManager` is initialized with a non-existent path
- **THEN** it SHALL return a default/empty configuration without throwing

### Requirement: CI runs unit tests on every PR
The CI workflow SHALL run `npm run test:unit` on every pull request and push to main.

#### Scenario: CI workflow includes unit test step
- **WHEN** a pull request is opened
- **THEN** the `ci.yml` workflow SHALL run `npm run test:unit` after compilation

#### Scenario: Integration tests run on schedule only
- **WHEN** a pull request is opened
- **THEN** the integration test workflow SHALL NOT be triggered (only nightly schedule and manual dispatch)
