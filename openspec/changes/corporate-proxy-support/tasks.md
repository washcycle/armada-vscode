## 1. Spike: injecting a proxy into grpc-js (decides D3)

- [ ] 1.1 Add an in-process HTTP CONNECT proxy test fixture (Node `http` server handling `CONNECT`, optional Basic auth, records tunnelled host:port) under `src/test/unit/support/`
- [ ] 1.2 Prototype Option A (target = proxy, `grpc.http_connect_target` / `grpc.http_connect_creds`, `grpc.enable_http_proxy: 0`, authority/SNI override) against plaintext and TLS fixture servers on non-default ports
- [ ] 1.3 Prototype Option B (scoped `grpc_proxy` / `no_grpc_proxy` env override around synchronous client construction) against the same fixtures
- [ ] 1.4 Record the decision and evidence in design.md (D3); if Option A, pin the `@grpc/grpc-js` minor version in package.json

## 2. Proxy resolution (pure module)

- [ ] 2.1 Create `src/net/proxy.ts` with `resolveProxy(endpoint, sources)` implementing context → setting → VS Code → env precedence (lower-case then upper-case env)
- [ ] 2.2 Implement `NO_PROXY` matching: `*`, leading-dot suffix, bare domain, IP, CIDR (v4/v6), optional port, always-bypass loopback
- [ ] 2.3 Implement `maskProxyUrl()` and use it for every proxy string that is displayed or logged
- [ ] 2.4 Unit tests for every scenario in `specs/proxy-support` (precedence, uppercase env, `off`, NO_PROXY forms, masking)

## 3. Configuration surface

- [ ] 3.1 Add `armada.proxy` (`inherit` | `off` | URL, machine scope) to package.json contributes.configuration, with a description pointing to `caCertPath` for TLS inspection
- [ ] 3.2 Add optional `proxy` / `noProxy` to `ArmadaContext` and `ResolvedConfig`; carry them through `configManager.ts` and `resolver.ts`
- [ ] 3.3 Read VS Code `http.proxy`, `http.noProxy` and `http.proxySupport` (treat `off` as no proxy unless context or setting explicitly sets one)
- [ ] 3.4 One-time warning when `armada.proxy` contains credentials (suggest env or a local forwarder)

## 4. Apply to gRPC

- [ ] 4.1 Build channel target/options from the resolved proxy for Submit, Event and Jobs clients using the mechanism chosen in 1.4
- [ ] 4.2 Resolve proxy/bypass separately for each Binoculars endpoint (explicit, pattern and derived)
- [ ] 4.3 Set `grpc.enable_http_proxy: 0` when bypassed or `off`, so stray env vars can't override
- [ ] 4.4 Verify TLS SNI and certificate verification target the Armada host through the tunnel, with `caCertPath` roots
- [ ] 4.5 Contract test: fails if a grpc-js upgrade stops honouring the injection mechanism

## 5. Apply to Lookout

- [ ] 5.1 Add `https-proxy-agent` / `http-proxy-agent` (or an equivalent zero-dependency CONNECT agent) and pass an explicit agent per request from the resolved proxy
- [ ] 5.2 Combine the agent with `caCertPath` CA bundle handling already on main
- [ ] 5.3 Tests: Lookout over plain and TLS through the in-process CONNECT proxy, with and without auth, and with bypass

## 6. Failure classification and diagnostics

- [ ] 6.1 Add a `stage` field to `ConnectionTestResult`; classify `proxy-connect`, `proxy-auth`, `proxy-refused`, `tls-untrusted`, `http2-blocked` per design D6
- [ ] 6.2 Detect NTLM/Negotiate-only 407 responses and return the forwarder guidance
- [ ] 6.3 Config panel: add a Network section (effective proxy masked, source, per-endpoint bypass) and stage-aware Test Connection results
- [ ] 6.4 Status bar tooltip mentions the proxy when the error stage is a proxy stage
- [ ] 6.5 Playwright webview tests for the Network section and each failure stage, using the in-process proxy fixture

## 7. Proxy CI workflow

- [ ] 7.1 Add `dev/proxy/` with a squid config (CONNECT-only; Basic auth and no-auth variants) and mitmproxy setup that generates a CA
- [ ] 7.2 Add a network-isolation script: the test runner on an internal Docker network with no default route; the proxy bridges to the kind network
- [ ] 7.3 Add a `proxy_mode` input to the reusable `integration-tests.yml` that wires proxy env/settings/`caCertPath` per mode
- [ ] 7.4 Create `.github/workflows/proxy-tests.yml` (nightly + dispatch) with matrix `connect`, `connect-noauth`, `intercept`, `env-uppercase`, `fail-fast: false`
- [ ] 7.5 Assert CONNECT entries for the Armada and Binoculars hosts in the proxy access log; upload proxy logs as artifacts on failure
- [ ] 7.6 Dry-run each leg via `workflow_dispatch` and record results in the PR

## 8. Docs

- [ ] 8.1 README "Corporate networks" section: proxy precedence, NO_PROXY, `caCertPath`, HTTP/2 inspection bypass, NTLM forwarders
- [ ] 8.2 CHANGELOG entry via conventional commit (`feat(net): ...`)
