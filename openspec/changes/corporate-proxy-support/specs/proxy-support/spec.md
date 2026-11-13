## ADDED Requirements

### Requirement: Effective proxy is resolved from a fixed precedence
The extension SHALL resolve one effective proxy per endpoint from, in order:
1. the active armadactl context's `proxy` / `noProxy`
2. the `armada.proxy` setting
3. VS Code `http.proxy` / `http.noProxy`
4. the environment: `grpc_proxy`, `https_proxy`, `HTTPS_PROXY`, `http_proxy`, `HTTP_PROXY`, plus `no_grpc_proxy`, `no_proxy`, `NO_PROXY`

The first source that defines a proxy SHALL win, and the result SHALL record which source it came from. `armada.proxy` SHALL accept `inherit` (default; fall through), `off` (no proxy, regardless of lower sources), or an `http://` / `https://` proxy URL.

#### Scenario: Context proxy overrides everything
- **WHEN** the context sets `proxy: http://ctx-proxy:3128` and `HTTPS_PROXY` is also set
- **THEN** the effective proxy is `http://ctx-proxy:3128` with source `context`

#### Scenario: VS Code proxy used when nothing more specific is set
- **WHEN** `armada.proxy` is `inherit`, the context has no proxy, and VS Code `http.proxy` is `http://corp:8080`
- **THEN** the effective proxy is `http://corp:8080` with source `vscode`

#### Scenario: Uppercase environment variables are honoured
- **WHEN** only `HTTPS_PROXY=http://corp:8080` is set in the environment
- **THEN** the effective proxy is `http://corp:8080` with source `env`

#### Scenario: Proxy explicitly disabled
- **WHEN** `armada.proxy` is `off` and `https_proxy` is set in the environment
- **THEN** no proxy is used for any endpoint, including gRPC channels

### Requirement: NO_PROXY bypass rules are applied consistently
The extension SHALL bypass the proxy for endpoints that match the resolved bypass list, using curl/Go semantics:
- `*` matches every host
- a leading `.` matches subdomains only
- a bare domain matches the host and its subdomains
- IP literals and CIDR ranges match addresses
- an optional `:port` restricts a match to that port

`localhost`, `127.0.0.0/8` and `::1` SHALL always bypass.

#### Scenario: Domain suffix bypass
- **WHEN** `NO_PROXY=.internal.example.com` and the Armada URL is `armada.internal.example.com:50051`
- **THEN** the gRPC channel connects directly without the proxy

#### Scenario: CIDR bypass
- **WHEN** `NO_PROXY=10.0.0.0/8` and the Armada URL is `10.1.2.3:30002`
- **THEN** the endpoint is bypassed

#### Scenario: Localhost always bypassed
- **WHEN** a proxy is configured and the Armada URL is `localhost:30002`
- **THEN** the endpoint is bypassed

### Requirement: Every outbound connection uses the same proxy decision
The Submit, Event, Jobs and Binoculars gRPC clients and the Lookout HTTP client SHALL each route through the effective proxy (or bypass it) according to the same resolution for their own endpoint. Lookout SHALL NOT depend on VS Code's implicit patching of Node's `http`/`https` modules.

#### Scenario: gRPC and Lookout agree
- **WHEN** a proxy is configured and neither the Armada nor the Lookout host is bypassed
- **THEN** both the gRPC calls and the Lookout HTTP requests are tunnelled through the proxy

#### Scenario: Binoculars bypass evaluated separately
- **WHEN** the Armada host is proxied but the Binoculars host matches `NO_PROXY`
- **THEN** log requests connect to Binoculars directly while other gRPC calls use the proxy

### Requirement: TLS through the proxy is verified against the Armada host
When an endpoint uses TLS through a CONNECT proxy, certificate verification and SNI SHALL target the Armada (or Binoculars or Lookout) host, not the proxy host. CA bundles from `caCertPath` SHALL apply to tunnelled connections.

#### Scenario: TLS-inspecting proxy with corporate CA
- **WHEN** the proxy re-signs TLS with a corporate CA and that CA is supplied via `caCertPath`
- **THEN** gRPC and Lookout connections through the proxy succeed

### Requirement: Proxy credentials are supported and never displayed
The extension SHALL support Basic proxy authentication from credentials in the proxy URL, and SHALL send `Proxy-Authorization` only to the proxy. Proxy credentials SHALL be masked (`user:****`) in the config panel, logs, error messages and status bar tooltips.

#### Scenario: Authenticated proxy
- **WHEN** the proxy is `http://alice:s3cret@corp:3128` and requires Basic auth
- **THEN** connections succeed through the proxy

#### Scenario: Credentials masked in output
- **WHEN** any message or panel displays the effective proxy `http://alice:s3cret@corp:3128`
- **THEN** it shows `http://alice:****@corp:3128`

#### Scenario: Unsupported auth scheme
- **WHEN** the proxy replies 407 with only `Proxy-Authenticate: NTLM` or `Negotiate`
- **THEN** the error explains that NTLM/Kerberos proxies are not supported directly and suggests a local forwarder such as cntlm or px
