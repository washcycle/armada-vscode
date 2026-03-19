## ADDED Requirements

### Requirement: Config panel displays resolved configuration
The `armada.showConfig` command SHALL open a singleton webview panel titled "Armada: Configuration" showing the active context's resolved configuration. The panel SHALL use VS Code theme variables for colours and be retained when hidden.

#### Scenario: Panel opens with config data
- **WHEN** `armada.showConfig` is invoked and a config is loaded
- **THEN** a webview panel opens showing: context name, server URL, TLS mode, binoculars URL (if set), lookout URL (if set), and auth type

#### Scenario: Panel reveals existing instance
- **WHEN** `armada.showConfig` is invoked and the panel is already open
- **THEN** the existing panel is brought to focus rather than opening a second panel

#### Scenario: Panel shows not-configured state
- **WHEN** `armada.showConfig` is invoked and no config is loaded
- **THEN** the panel shows a message prompting the user to run "Setup Configuration"

### Requirement: Secrets are masked in the config panel
Any credential field whose key matches the pattern `/password|token|secret|key/i` SHALL be rendered as `••••••••` by default. A "Show" toggle SHALL be available for each masked field.

#### Scenario: Password field is masked by default
- **WHEN** the active context uses basic auth
- **THEN** the username is shown plaintext and the password is rendered as `••••••••`

#### Scenario: Show toggle reveals secret value
- **WHEN** the user clicks "Show" on a masked field
- **THEN** the field value is revealed in plaintext and the button label changes to "Hide"

#### Scenario: Hide toggle re-masks the value
- **WHEN** the user clicks "Hide" on a revealed field
- **THEN** the value is replaced with `••••••••` again

### Requirement: Test Connection button probes the server
The config panel SHALL include a "Test Connection" button that invokes `testConnection()` and renders the result inline within the panel.

#### Scenario: Test in progress
- **WHEN** the user clicks "Test Connection"
- **THEN** the button is disabled and a spinner/loading indicator is shown

#### Scenario: Test succeeds
- **WHEN** `testConnection()` resolves with `ok: true`
- **THEN** the panel shows a success indicator with the detail string (e.g. "4 queues found") and the status bar updates to `$(check)`

#### Scenario: Test fails
- **WHEN** `testConnection()` resolves with `ok: false`
- **THEN** the panel shows an error indicator with the human-readable `message` field and the status bar updates to `$(error)` or `$(warning)` as appropriate

### Requirement: Config panel is accessible from palette and sidebar
The `armada.showConfig` command SHALL be registered in `package.json` with a user-facing title and SHALL appear in the command palette.

#### Scenario: Command palette entry
- **WHEN** the user opens the command palette and types "Armada"
- **THEN** "Armada: Show Configuration" appears as an option

#### Scenario: Context dropdown for multiple contexts
- **WHEN** the config file contains more than one context
- **THEN** the panel shows a dropdown to switch between contexts, and selecting a different context re-renders the panel with that context's config
