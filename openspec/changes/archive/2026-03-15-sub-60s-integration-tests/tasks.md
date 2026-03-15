## 1. Test directory restructure

- [x] 1.1 Create `src/test/unit/` directory for unit tests
- [x] 1.2 Create `src/test/unit/index.ts` — plain Mocha runner (no `@vscode/test-electron`) that discovers `**/*.test.js` in the unit directory
- [x] 1.3 Move command registration and activation tests from `integration.test.ts` into `src/test/unit/extension.test.ts` (these tests use `@vscode/test-electron` via a separate runner)
- [x] 1.4 Create `src/test/unit/runTest.ts` — unit test entry point that runs Mocha directly with `ts-node` or compiled JS

## 2. Mock gRPC server

- [x] 2.1 Create `src/test/mock/armadaServer.ts` — mock gRPC server class using `@grpc/grpc-js` and `@grpc/proto-loader` that loads proto files from `src/proto/`
- [x] 2.2 Implement Submit service handlers: `SubmitJobs` (returns generated job IDs), `CancelJobs` (returns empty), `GetQueue` (returns queue with name), `GetQueues` (streams one queue), `CreateQueue` (returns empty)
- [x] 2.3 Implement Event service handler: `GetJobSetEvents` (streams submitted → queued → running → succeeded events, then ends)
- [x] 2.4 Implement Jobs service handlers: `GetJobStatus` (returns map with "RUNNING"), `GetJobDetails` (returns map with cluster info), `GetJobErrors` (returns empty map)
- [x] 2.5 Add `start()` method that binds to port 0 and returns the assigned port, and `stop()` method for clean shutdown

## 3. Unit tests for gRPC client

- [x] 3.1 Create `src/test/unit/grpc/armadaClient.test.ts` — tests that start the mock server in `before()` and stop it in `after()`
- [x] 3.2 Add test: `submitJobs` sends correct proto format and receives job IDs
- [x] 3.3 Add test: `streamJobSetEvents` receives and converts event sequence
- [x] 3.4 Add test: `cancelJob` sends correct request fields
- [x] 3.5 Add test: `getAllQueues` returns parsed queue list
- [x] 3.6 Add test: `getJobStatus` returns status map
- [x] 3.7 Add test: `testConnection` succeeds against mock server

## 4. Unit tests for config and YAML

- [x] 4.1 Create `src/test/unit/config/configManager.test.ts` — tests for config resolution using fixture files
- [x] 4.2 Add test: config loads from `test-config.yaml` and resolves armadaUrl and context
- [x] 4.3 Add test: config handles missing file without throwing

## 5. Package.json and CI updates

- [x] 5.1 Add `test:unit` script to `package.json`: runs Mocha on `out/test/unit/` directly (no `@vscode/test-electron`)
- [x] 5.2 Add `test:integration` script: the existing `node ./out/test/runTest.js` command
- [x] 5.3 Update `pretest` to compile tests with `tsc` before running
- [x] 5.4 Update `.github/workflows/ci.yml`: replace `xvfb-run -a npm run test` with `npm run test:unit`
- [x] 5.5 Update `.github/workflows/integration-tests.yml`: change trigger from `pull_request` to `schedule` (nightly) + `workflow_dispatch`

## 6. Verify

- [x] 6.1 Run `npm run test:unit` locally and verify all tests pass in <30s
- [ ] 6.2 Run `npm run test:integration` locally (if cluster available) to verify existing tests still pass
- [ ] 6.3 Verify CI runs unit tests on PR push
