## MODIFIED Requirements

### Requirement: Config panel displays resolved configuration
The `armada.showConfig` command SHALL open a singleton webview panel titled "Armada: Configuration" showing the active context's resolved configuration. The panel SHALL use VS Code theme variables for colours and be retained when hidden.

#### Scenario: Panel opens with config data
- **WHEN** `armada.showConfig` is invoked and a config is loaded
- **THEN** a webview panel opens showing: context name, server URL, TLS mode, binoculars URL (if set), lookout URL (if set), auth type, and a Network section with the effective proxy (credentials masked), its source (`context`, `setting`, `vscode`, `env` or `none`), and whether the Armada, Binoculars and Lookout endpoints bypass it

#### Scenario: Panel reveals existing instance
- **WHEN** `armada.showConfig` is invoked and the panel is already open
- **THEN** the existing panel is brought to focus rather than opening a second panel

#### Scenario: Panel shows not-configured state
- **WHEN** `armada.showConfig` is invoked and no config is loaded
- **THEN** the panel shows a message prompting the user to run "Setup Configuration"

#### Scenario: Panel shows no proxy
- **WHEN** no proxy is resolved from any source
- **THEN** the Network section shows "Direct (no proxy)"

### Requirement: Test Connection button probes the server
The config panel SHALL include a "Test Connection" button that invokes `testConnection()` and renders the result inline within the panel. When a proxy is in use, the result SHALL name the stage that failed.

#### Scenario: Test in progress
- **WHEN** the user clicks "Test Connection"
- **THEN** the button is disabled and a spinner/loading indicator is shown

#### Scenario: Test succeeds
- **WHEN** `testConnection()` resolves with `ok: true`
- **THEN** the panel shows a success indicator with the detail string (e.g. "4 queues found") and the status bar updates to `$(check)`, and when a proxy was used the detail notes "via proxy <masked proxy>"

#### Scenario: Test fails
- **WHEN** `testConnection()` resolves with `ok: false`
- **THEN** the panel shows an error indicator with the human-readable `message` field and the status bar updates to `$(error)` or `$(warning)` as appropriate

#### Scenario: Test fails at the proxy
- **WHEN** `testConnection()` fails with a proxy-stage failure (`proxy-connect`, `proxy-auth`, `proxy-refused`, `tls-untrusted`, `http2-blocked`)
- **THEN** the panel shows which stage failed and the corresponding remediation hint
