## ADDED Requirements

### Requirement: Separate proxy integration workflow
The repository SHALL include a GitHub Actions workflow, separate from per-PR CI, that runs the integration suite against a real Armada deployment through a proxy. It SHALL run nightly and on manual dispatch, and SHALL NOT be a required status check.

#### Scenario: Scheduled run
- **WHEN** the nightly schedule fires
- **THEN** the proxy workflow runs every proxy mode in a matrix with `fail-fast` disabled

#### Scenario: Manual run of one mode
- **WHEN** a maintainer dispatches the workflow with `proxy_mode: intercept`
- **THEN** only the TLS-intercepting leg runs

### Requirement: Direct egress is blocked during proxy tests
The test runner SHALL have no network route to the Armada, Binoculars or Lookout endpoints except through the proxy, so a connection that ignores the proxy fails instead of silently succeeding.

#### Scenario: Proxy setting ignored
- **WHEN** a code change makes the gRPC client connect directly instead of through the proxy
- **THEN** the proxy workflow fails

### Requirement: Proxy modes covered
The workflow SHALL cover at least:
- `connect`: a CONNECT-only forward proxy with Basic auth
- `connect-noauth`: a CONNECT-only forward proxy without auth
- `intercept`: a TLS-intercepting proxy whose CA is provided via `caCertPath`
- `env-uppercase`: a proxy configured only via uppercase `HTTPS_PROXY` / `NO_PROXY`

#### Scenario: TLS interception leg
- **WHEN** the `intercept` leg runs with the generated CA in `caCertPath`
- **THEN** connection tests, job submission and log retrieval succeed through the intercepting proxy over HTTP/2

### Requirement: Proxy usage is asserted, not assumed
Each leg SHALL assert from the proxy's access log that the Armada and Binoculars hosts were tunnelled through it. On failure it SHALL upload the proxy logs as artifacts.

#### Scenario: Evidence of tunnelling
- **WHEN** a leg completes
- **THEN** the job checks that the proxy access log contains CONNECT entries for the Armada and Binoculars endpoints, and fails if they are absent
