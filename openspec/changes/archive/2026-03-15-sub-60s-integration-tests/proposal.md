## Why

Integration tests take ~3 minutes because they spin up a full Armada cluster (kind + postgres + redis + pulsar + operator + 4 Armada services) to test an extension that only has 17 tests — 16 of which verify command registration and extension activation without touching Armada. Only 1 test attempts a gRPC call, and it gracefully skips if Armada is unavailable. The infrastructure cost is ~180x the actual test runtime (~1s of tests vs ~180s of setup).

## What Changes

- **Split tests into two tiers**: unit tests (no cluster needed) and integration tests (needs Armada)
- **Add a mock gRPC server** that implements the Armada proto services for unit-level testing of gRPC client logic without a real cluster
- **Move command registration, activation, YAML validation, and config tests to unit tests** that run without any infrastructure
- **Keep integration tests for smoke-testing against a real Armada** but run them on a separate schedule (nightly/weekly) instead of every PR
- **Target: unit tests complete in <30s**, integration tests remain as-is for nightly runs

## Capabilities

### New Capabilities
- `mock-grpc-server`: A lightweight in-process gRPC server that implements Armada's Submit, Event, Jobs, and Binoculars services with canned responses for testing
- `unit-test-suite`: Fast unit tests covering extension activation, command registration, config resolution, YAML parsing, proto conversion, and gRPC client logic against the mock server

### Modified Capabilities

## Impact

- `src/test/` — restructured into `unit/` and `integration/` subdirectories
- `src/test/mock/` — new mock gRPC server implementation
- `package.json` — new `test:unit` and `test:integration` scripts
- `.github/workflows/ci.yml` — runs unit tests (fast) on every PR
- `.github/workflows/integration-tests.yml` — changed to nightly/weekly schedule instead of every PR
- `tsconfig.json` — may need test path updates
