## 1. Connection State in ArmadaClient

- [x] 1.1 Add `ConnectionState` type (`'unknown' | 'connected' | 'error' | 'auth-error'`) and `ConnectionTestResult` interface to `src/types/armada.ts` or inline in `armadaClient.ts`
- [x] 1.2 Add `connectionState: ConnectionState` property (default `'unknown'`) and `onConnectionStateChange` callback to `ArmadaClient`
- [x] 1.3 Add private `updateConnectionState(state, detail?)` helper that sets the property and fires the callback
- [x] 1.4 Wrap gRPC call outcomes in existing methods to call `updateConnectionState` — `'connected'` on success, `'error'` on code 13/14, `'auth-error'` on code 16/7, no change for application-level codes
- [x] 1.5 Implement `testConnection(): Promise<ConnectionTestResult>` using `GetActiveQueues` as the probe; map known gRPC codes to human-readable messages; resolve (never throw)

## 2. Status Bar Connection State

- [x] 2.1 Update `updateStatusBar()` in `extension.ts` to read `armadaClient?.connectionState` and set icon/tooltip per spec (`$(server-process)`, `$(check)`, `$(error)`, `$(warning)`)
- [x] 2.2 Wire `armadaClient.onConnectionStateChange` after client creation so every state change calls `updateStatusBar()`
- [x] 2.3 Make `statusBarItem.command` context-sensitive: `armada.switchContext` when healthy/unknown, `armada.showConfig` when error/auth-error
- [x] 2.4 Re-wire the callback whenever `armadaClient` is replaced (context switch, config reload)

## 3. Config Viewer Panel

- [x] 3.1 Create `src/panels/configPanel.ts` with singleton `ConfigPanel.show(config, client, contexts)` static method following `JobDetailPanel` pattern
- [x] 3.2 Implement `renderHtml()` — connection section (URL, TLS, binoculars, lookout), auth section (type + non-secret fields plaintext, secret fields masked)
- [x] 3.3 Add context dropdown to the panel HTML when more than one context exists
- [x] 3.4 Enable `enableScripts: true`; implement webview ↔ extension message passing for: `testConnection` request, `testResult` response, `revealSecret` request/response
- [x] 3.5 Render Test Connection button with loading/disabled state; render inline result (success or error with human-readable message) on `testResult` message
- [x] 3.6 Handle `revealSecret` / `hideSecret` message round-trip for show/hide toggle on masked fields

## 4. Command Registration and Wiring

- [x] 4.1 Register `armada.showConfig` command in `extension.ts`, passing current config, client, and all contexts to `ConfigPanel.show()`
- [x] 4.2 Add `armada.showConfig` to `package.json` commands with title `"Armada: Show Configuration"` and palette entry
- [x] 4.3 Handle the `testConnection` webview message in the command handler — call `armadaClient.testConnection()`, post `testResult` back to the panel

## 5. Verification

- [ ] 5.1 Manual test: start extension with armada-server down — status bar shows `$(error)`, clicking opens config panel
- [ ] 5.2 Manual test: click "Test Connection" with server down — panel shows human-readable error message
- [ ] 5.3 Manual test: restart server, click "Test Connection" — panel shows success, status bar flips to `$(check)`
- [ ] 5.4 Manual test: basic auth config — password is masked, show/hide toggle works
- [ ] 5.5 Manual test: multiple contexts — dropdown renders and re-renders panel on selection
