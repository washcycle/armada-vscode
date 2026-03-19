## ADDED Requirements

### Requirement: ArmadaClient tracks connection state
`ArmadaClient` SHALL maintain a `connectionState` property of type `'unknown' | 'connected' | 'error' | 'auth-error'`, initialised to `'unknown'`. An `onConnectionStateChange` callback property SHALL be invoked whenever state transitions occur, receiving the new state and an optional human-readable detail string.

#### Scenario: State transitions to connected on successful call
- **WHEN** any gRPC call completes successfully
- **THEN** `connectionState` is set to `'connected'` and `onConnectionStateChange` is invoked with `'connected'`

#### Scenario: State transitions to error on transport failure
- **WHEN** a gRPC call fails with status code 13 (INTERNAL) or 14 (UNAVAILABLE)
- **THEN** `connectionState` is set to `'error'` and `onConnectionStateChange` is invoked with `'error'` and a detail string mapping the code to a human-readable explanation

#### Scenario: State transitions to auth-error on authentication failure
- **WHEN** a gRPC call fails with status code 16 (UNAUTHENTICATED) or 7 (PERMISSION_DENIED)
- **THEN** `connectionState` is set to `'auth-error'` and `onConnectionStateChange` is invoked with `'auth-error'`

#### Scenario: Application-level errors do not change state
- **WHEN** a gRPC call fails with status code 5 (NOT_FOUND), 12 (UNIMPLEMENTED), or 2 (UNKNOWN)
- **THEN** `connectionState` is NOT changed and `onConnectionStateChange` is NOT invoked

### Requirement: testConnection returns a structured result
`ArmadaClient` SHALL expose a `testConnection()` method that probes the server using `GetActiveQueues` and returns a `ConnectionTestResult` object rather than throwing. The result SHALL include `ok: boolean`, and on failure, a `code: number` and `message: string` with a human-readable explanation.

#### Scenario: Successful probe
- **WHEN** `testConnection()` is called and the server responds to `GetActiveQueues`
- **THEN** the method resolves with `{ ok: true, detail: "<N> queues found" }` and updates `connectionState` to `'connected'`

#### Scenario: Unreachable server probe
- **WHEN** `testConnection()` is called and the server returns code 14
- **THEN** the method resolves (does not throw) with `{ ok: false, code: 14, message: "Cannot reach Armada server at <url>. Is armada-server running?" }` and updates `connectionState` to `'error'`

#### Scenario: Auth failure probe
- **WHEN** `testConnection()` is called and the server returns code 16
- **THEN** the method resolves with `{ ok: false, code: 16, message: "Authentication failed. Check your credentials." }` and updates `connectionState` to `'auth-error'`

### Requirement: Status bar reflects connection state
The VS Code status bar item for Armada SHALL update its icon and tooltip to reflect the current `connectionState` whenever `onConnectionStateChange` fires.

#### Scenario: Unknown state display
- **WHEN** `connectionState` is `'unknown'`
- **THEN** status bar shows `$(server-process) Armada: <context>` with tooltip `<url> · Click to switch context`

#### Scenario: Connected state display
- **WHEN** `connectionState` transitions to `'connected'`
- **THEN** status bar shows `$(check) Armada: <context>` with tooltip `Connected to <url>`

#### Scenario: Error state display
- **WHEN** `connectionState` transitions to `'error'`
- **THEN** status bar shows `$(error) Armada: <context>` with tooltip `Cannot reach <url> · Click to diagnose`

#### Scenario: Auth error state display
- **WHEN** `connectionState` transitions to `'auth-error'`
- **THEN** status bar shows `$(warning) Armada: <context>` with tooltip `Authentication failed · Click to diagnose`

### Requirement: Status bar click target is context-sensitive
The status bar item command SHALL adapt based on connection state.

#### Scenario: Click when healthy
- **WHEN** `connectionState` is `'unknown'` or `'connected'` and the user clicks the status bar
- **THEN** the `armada.switchContext` command is invoked

#### Scenario: Click when unhealthy
- **WHEN** `connectionState` is `'error'` or `'auth-error'` and the user clicks the status bar
- **THEN** the `armada.showConfig` command is invoked, opening the config panel
