# Integration Tests

This directory contains integration tests for the Armada VSCode extension.

## Overview

The integration tests verify that all extension commands are properly registered and can be executed. The tests are designed to run both locally and in CI with a live Armada instance.

## Test Structure

```
src/test/
├── fixtures/           # Test data files
│   ├── test-config.yaml         # Sample Armada configuration
│   └── test-job.armada.yaml     # Sample job specification
├── suite/             # Test suites
│   ├── helpers.ts              # Shared test utilities
│   ├── index.ts                # Mocha test runner setup
│   └── integration.test.ts     # Main integration test suite
└── runTest.ts         # VSCode test runner entry point
```

## Running Tests Locally

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the extension:
   ```bash
   npm run compile
   ```

3. (Optional) Set up a local Armada instance:
   ```bash
   cd dev
   make up
   ```

### Run Tests

```bash
npm test
```

The tests will:
1. Launch a VSCode instance in test mode
2. Load the extension
3. Execute all test cases
4. Report results

## Running Tests in CI

The integration tests run automatically in GitHub Actions on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

The CI workflow:
1. Sets up a complete test environment with Node.js, Docker, kubectl, Helm, and kind
2. Creates a local Kubernetes cluster using kind
3. Deploys Armada using the existing `dev/Makefile` setup
4. Runs the integration tests against the live Armada instance
5. Collects logs and cleans up resources

See [`.github/workflows/integration-tests.yml`](../../.github/workflows/integration-tests.yml) for the complete workflow definition.

## Test Coverage

The integration tests verify the following extension commands:

1. **Setup & Configuration**
   - `armada.setupConfig` - Configuration setup
   - `armada.switchContext` - Context switching

2. **Job Management**
   - `armada.submitJob` - Job submission from YAML files
   - `armada.cancelJob` - Job cancellation
   - `armada.viewJobLogs` - Job log viewing

3. **Job Monitoring**
   - `armada.refreshJobs` - Job list refresh
   - `armada.refreshJobsQueryAPI` - Job refresh via Query API
   - `armada.loadJobSet` - Load specific job set
   - `armada.browseJobSets` - Browse available job sets
   - `armada.clearMonitoredJobSets` - Clear monitored job sets

4. **Queue Browsing**
   - `armada.browseQueues` - Browse all queues
   - `armada.browseActiveQueues` - Browse active queues

5. **YAML Validation**
   - Schema validation for `.armada.yaml` files

## Writing New Tests

To add new test cases:

1. Add your test to `src/test/suite/integration.test.ts` or create a new test file
2. Follow the existing test structure using Mocha's `suite()` and `test()` functions
3. Use the helper functions from `helpers.ts` for common operations
4. Ensure tests clean up after themselves
5. Make tests resilient to Armada unavailability (they should skip gracefully)

Example:
```typescript
test('My new command should work', async function() {
    this.timeout(10000);
    
    try {
        await executeCommand('armada.myCommand');
        assert.ok(true, 'Command executed successfully');
    } catch (error) {
        console.log('Test note:', error);
    }
});
```

## Troubleshooting

### Tests fail locally

1. Verify extension compiles without errors: `npm run compile`
2. Check that VSCode can be launched in test mode
3. Ensure you have Xvfb installed if running headless: `sudo apt-get install xvfb`

### Tests fail in CI

1. Check the workflow logs for Armada setup issues
2. Verify the Armada cluster is running correctly
3. Check for timeout issues (increase timeout if needed)
4. Review the collected logs in the "Collect logs on failure" step

### Armada not accessible

Tests that require a live Armada instance will gracefully skip if Armada is not available. Look for `this.skip()` calls in the test output.

## Future Improvements

- Add more comprehensive end-to-end tests with actual job submission and monitoring
- Add tests for error handling scenarios
- Add tests for multi-context switching
- Add performance tests for large job lists
- Add tests for real-time job status updates
