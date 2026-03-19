## Why

When the Armada server is unreachable, the extension silently fails with raw gRPC error codes (e.g. `14 UNAVAILABLE`) that give users no actionable information and no way to distinguish a misconfiguration from a transient outage. The status bar always shows "connected" regardless of actual server health, making it impossible to diagnose problems at a glance.

## What Changes

- **New**: Config viewer panel (webview) showing the active context's configuration with secrets masked and a "Test Connection" button
- **New**: `armadaClient.testConnection()` method that probes the server and returns a structured result with human-readable error mapping
- **New**: `onConnectionStateChange` callback on `ArmadaClient` that fires whenever connection state changes
- **Updated**: Status bar reflects real connection state — `$(server-process)` (unknown), `$(check)` (connected), `$(error)` (unreachable), `$(warning)` (auth error)
- **Updated**: Clicking the status bar in error state opens the config panel instead of the context switcher
- **New**: `armada.showConfig` command registered in the command palette

## Capabilities

### New Capabilities

- `connection-health`: Real-time connection state tracking on `ArmadaClient` — emits state transitions (unknown → connected/error) driven by gRPC call outcomes and explicit test probes. Maps gRPC status codes to human-readable diagnostics.
- `config-viewer-panel`: Webview panel displaying the active context's resolved configuration. Shows all non-secret fields plainly; masks secrets (passwords, tokens) with a show/hide toggle. Includes a "Test Connection" button that invokes the connection health probe and renders the result inline.

### Modified Capabilities

(none)

## Impact

- `src/grpc/armadaClient.ts` — adds `testConnection()` and `onConnectionStateChange` callback; existing gRPC calls update connection state on success/failure
- `src/panels/configPanel.ts` — new file
- `src/extension.ts` — wires `onConnectionStateChange` to status bar updates; registers `armada.showConfig`; conditionally changes status bar click target
- `package.json` — registers `armada.showConfig` command
