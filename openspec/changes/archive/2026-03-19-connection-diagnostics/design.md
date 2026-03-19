## Context

The extension currently has no feedback loop between gRPC call outcomes and the UI. `ArmadaClient` logs errors to `console.error` only; the status bar is driven solely by whether config is loaded (not whether the server is reachable); and error toasts expose raw gRPC status codes. Users cannot tell whether a failure is a misconfiguration, a downed server, or a transient blip.

The existing `JobDetailPanel` establishes the webview pattern we follow. The `outputChannel` already exists in `extension.ts` but is never passed to `ArmadaClient`. The status bar item is currently wired exclusively to `switchContext`.

## Goals / Non-Goals

**Goals:**
- Real-time connection state reflected in the status bar (unknown / connected / error / auth-error)
- Config viewer panel with secrets masked and a "Test Connection" button
- Human-readable gRPC error messages surfaced to the user
- `armada.showConfig` command accessible from the palette and sidebar

**Non-Goals:**
- Automatic reconnection or polling — state is updated reactively on call outcomes only
- Editing config from the panel — read-only view only
- Supporting every possible auth credential type with custom masking rules — basic password and any field named `password`/`token`/`secret` are masked; others are shown

## Decisions

### Connection state lives on ArmadaClient via a callback

**Decision**: Add `onConnectionStateChange: ((state: ConnectionState, detail?: string) => void) | undefined` to `ArmadaClient`. Each gRPC call invokes this on success (`'connected'`) or on transport-class errors code 13/14 (`'error'`) and code 16 (`'auth-error'`). Application-level errors (NOT_FOUND, UNIMPLEMENTED) do not change state.

**Alternatives considered**:
- EventEmitter: more idiomatic Node but adds an import and lifecycle concern; a single callback is sufficient for one listener (extension.ts).
- Polling health check timer: would give passive recovery detection but adds background activity and complexity. Deferred to a follow-up.

### testConnection() uses GetActiveQueues as the probe

**Decision**: `testConnection()` calls `GetActiveQueues` (unary, Jobs service). On success it returns `{ ok: true, detail: "N queues found" }`. On failure it maps the gRPC code to a `{ ok: false, code, message }` result rather than throwing, so callers get structured data.

**Alternatives considered**:
- `GetQueues` (streaming, Submit service): streaming makes timing and error handling more complex for a probe.
- A dedicated health endpoint: Armada doesn't expose one; using a real API call is more representative.

### Status bar click behaviour is context-dependent

**Decision**: When `connectionState` is `'error'` or `'auth-error'`, `statusBarItem.command` is set to `armada.showConfig`. Otherwise it remains `armada.switchContext`. This preserves the fast context-switch flow for healthy connections while routing failure clicks to diagnostics.

### Config panel is a retained singleton webview

**Decision**: `ConfigPanel` follows the same singleton pattern as `JobDetailPanel` — `ConfigPanel.show()` reveals an existing panel or creates a new one. Scripts are enabled for the "Test Connection" button message pass; no external resources are loaded.

### Secret masking is field-name based

**Decision**: Any credential field whose key matches `/password|token|secret|key/i` is rendered as `••••••••` with a show/hide toggle (implemented via a button that posts a `reveal` message to the extension, which replies with the plaintext value — the value is never embedded in the initial HTML). `providerUrl`, `clientId`, `cmd`, `args`, `username` are shown plaintext.

**Rationale**: Avoids a bespoke masking rule per auth type; covers the common cases without over-engineering.

## Risks / Trade-offs

- **State lag**: Connection state only updates when a command is run or Test Connection is clicked. A server that goes down between commands will still show `$(check)` until the next call. → Acceptable for now; a polling option can be added later.
- **webview script surface**: Enabling `enableScripts: true` adds a small XSS surface. All dynamic content is escaped; no user-supplied content is inserted as raw HTML. → Standard mitigation per VS Code webview guidance.
- **Show/hide secret round-trip**: Clicking "show" posts a message to the extension which replies with the value. This is synchronous from the user's perspective but adds a message-passing hop. → Acceptable; secrets should not be baked into initial HTML.

## Open Questions

- Should the panel also offer a "Copy to clipboard" action for the server URL? (convenience for sharing config with support)
- Should `testConnection()` also be called automatically on extension activation (once, after client init)?
