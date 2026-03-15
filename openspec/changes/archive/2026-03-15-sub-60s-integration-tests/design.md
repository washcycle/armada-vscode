## Context

The extension has 17 integration tests that take ~3 minutes to run because they require a full Armada cluster (kind + postgres + redis + pulsar + operator + 4 services). Analysis shows:

- 16/17 tests verify command registration and extension activation — no Armada interaction
- 1/17 tests attempts a gRPC call but gracefully skips if unavailable
- The test runner uses `@vscode/test-electron` which spawns a VS Code instance (~10s overhead)
- Actual test execution is ~1s; infrastructure setup is ~180s

Current test file structure:
```
src/test/
├── runTest.ts           # @vscode/test-electron launcher
├── suite/
│   ├── index.ts         # Mocha harness
│   ├── integration.test.ts  # All 17 tests
│   └── helpers.ts       # Utilities
└── fixtures/
    ├── test-config.yaml
    └── test-job.armada.yaml
```

## Goals / Non-Goals

**Goals:**
- Unit tests (command registration, config, YAML, proto conversion) complete in <30s total
- gRPC client logic testable without a real Armada cluster via mock server
- CI runs unit tests on every PR; integration tests move to nightly schedule
- Maintain the existing integration test suite unchanged for nightly verification

**Non-Goals:**
- Rewriting existing integration tests
- Achieving 100% code coverage
- Mocking the VS Code API itself (still use `@vscode/test-electron` for activation tests)
- Testing the Armada operator or cluster deployment

## Decisions

### 1. Two-tier test structure: `test:unit` and `test:integration`

**Decision**: Split into `npm run test:unit` (runs on every PR, <30s) and `npm run test:integration` (nightly, ~3min).

**Rationale**: 16/17 tests don't need Armada. Running them separately removes the cluster dependency for the fast path. The existing integration test suite stays untouched as a nightly smoke test.

**Alternative considered**: Single test suite with conditional skips — already partially done but still requires the VS Code test electron setup (~10s) even when skipping.

### 2. In-process mock gRPC server using `@grpc/grpc-js`

**Decision**: Create a mock Armada gRPC server using the same `@grpc/grpc-js` and `@grpc/proto-loader` that the extension already depends on. The server loads the same proto files and implements handlers that return canned responses.

**Rationale**: No new dependencies needed. The mock server starts in ~50ms (vs 180s for a real cluster). It validates that the client correctly constructs proto messages and handles responses. Using the real proto files ensures the mock stays in sync with the API contract.

**Alternative considered**: HTTP mocking (nock/msw) — doesn't work for gRPC. Dependency injection with mock client class — wouldn't test proto serialization or real gRPC transport.

### 3. Keep `@vscode/test-electron` for activation tests, add plain Mocha for unit tests

**Decision**: Unit tests that test gRPC client logic, config parsing, and proto conversion run as plain Mocha tests without VS Code. Only command registration and activation tests still use `@vscode/test-electron`.

**Rationale**: `@vscode/test-electron` adds ~10s of startup to download/launch VS Code. Tests that don't need the VS Code API can run as plain Node.js tests with Mocha, completing in <1s.

**Alternative considered**: Run everything through `@vscode/test-electron` — adds unnecessary overhead for tests that don't depend on VS Code APIs.

### 4. CI workflow changes

**Decision**: `ci.yml` runs `npm run test:unit`. `integration-tests.yml` changes trigger from `pull_request` to `schedule` (nightly) + `workflow_dispatch`.

**Rationale**: PR CI should be fast. Integration tests verify the deployment stack, not the extension code. Running them nightly catches regressions without blocking PRs.

## Risks / Trade-offs

- **[Mock drift]** Mock server could diverge from real Armada behavior → Mitigation: mock loads the same proto files; nightly integration tests catch drift
- **[VS Code API dependency]** Some extension code imports `vscode` which can't run outside `@vscode/test-electron` → Mitigation: test gRPC client and config modules directly (they don't import `vscode`); keep activation tests in the VS Code runner
- **[False confidence]** Unit tests pass but integration breaks → Mitigation: nightly integration tests; the mock tests real gRPC transport, not just interfaces
