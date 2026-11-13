## Why

On corporate networks, outbound traffic must go through an HTTP(S) proxy, often one that also inspects TLS. Today the extension's two network paths behave differently there:
- **gRPC (`@grpc/grpc-js`) ignores VS Code's proxy settings.** It honours only lowercase `grpc_proxy`/`https_proxy`/`http_proxy` env vars, which corporate machines frequently set only in uppercase, or not at all because VS Code's `http.proxy` is configured instead.
- **The Lookout HTTP client goes through Node's `https`,** which VS Code's proxy support patches.

So the same machine can browse job sets but fail to submit, cancel or stream. The failure surfaces as a generic `UNAVAILABLE` "Is armada-server running?". `caCertPath` (already on main) solves certificate trust for TLS-inspecting proxies, but not proxy routing, proxy authentication, or diagnosis. Nothing in CI exercises any of this, so regressions would be invisible.

## What Changes

- **One effective proxy configuration used by every connection the extension makes.** That covers the gRPC Submit/Event/Jobs/Binoculars clients and the Lookout HTTP client. It is resolved in this order:
  1. a per-context `proxy` / `noProxy` in the armadactl context
  2. a new `armada.proxy` setting (`inherit` default | `off` | explicit URL)
  3. VS Code `http.proxy` + `http.noProxy`
  4. environment `grpc_proxy` / `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy`, plus `NO_PROXY` / `no_proxy` (both cases)
- **Proxy authentication** via credentials in the proxy URL (Basic), with credentials masked everywhere they are displayed or logged. NTLM/Kerberos are explicitly out of scope; the error message points users to a local auth-forwarding proxy (e.g. cntlm, px).
- **Honour `NO_PROXY`** (hosts, domains with leading `.`, CIDRs, `*`), so in-cluster or localhost endpoints bypass the proxy.
- **TLS-inspecting proxies** keep using `caCertPath`. The extension additionally detects the two common failure modes and names them: an untrusted interception CA, and an interceptor that downgrades or blocks HTTP/2, which gRPC requires.
- **Config panel diagnostics.** It shows the effective proxy (credentials masked), where it came from, and whether the current endpoint bypasses it. Test Connection reports which stage failed: proxy connect, proxy auth (407), TLS trust, HTTP/2 negotiation, or server.
- **Proxy-specific connection-health classification**, so the status bar and messages say "proxy" instead of "server down".
- **New, separate CI workflow `proxy-tests.yml`.** It runs the integration suite inside a network where direct egress to Armada is blocked, through:
  - (a) a CONNECT-only forward proxy (squid) with Basic auth
  - (b) a TLS-intercepting proxy (mitmproxy) with a generated CA supplied through `caCertPath`

  It is kept out of the per-PR CI path because it needs a kind cluster plus proxy containers. It runs nightly and on demand, and can be called from `armada-compat.yml` later.

No breaking changes: with no proxy configured anywhere, behaviour is unchanged.

## Capabilities

### New Capabilities
- `proxy-support`: resolving the effective proxy and its bypass list from context, settings, VS Code and environment; applying it consistently to gRPC and Lookout; proxy authentication and credential masking; TLS-inspection failure detection.
- `proxy-ci-testing`: the separate CI workflow that runs the integration suite through a CONNECT proxy and a TLS-intercepting proxy, with direct egress blocked so a bypass can't pass silently.

### Modified Capabilities
- `config-viewer-panel`: the panel shows the effective proxy, its source and bypass status, and Test Connection reports the failing stage when a proxy is involved.
- `connection-health`: proxy failures (connect refused, 407, untrusted interception CA, HTTP/2 blocked) get their own classification and messages instead of the generic "Cannot reach Armada server".

## Impact

- **Code**:
  - `src/grpc/armadaClient.ts`: channel options / proxy target for all clients, Binoculars included
  - `src/api/lookoutClient.ts`: explicit proxy agent instead of relying on VS Code's patching
  - new `src/net/proxy.ts`: resolution, `NO_PROXY` matching, masking
  - `src/config/configManager.ts`, `src/config/resolver.ts`, `src/types/config.ts`: per-context `proxy` / `noProxy`
  - `src/panels/configPanel.ts`: diagnostics
  - `package.json`: `armada.proxy` setting
- **Dependencies**: possibly `https-proxy-agent` for Lookout. gRPC reuses grpc-js's built-in HTTP CONNECT support, so no new gRPC dependency. grpc-js has no public option for an explicit proxy URL (it reads only env vars), so how to inject the resolved proxy is the main design risk; it is settled by a spike (see design.md).
- **CI**: new `.github/workflows/proxy-tests.yml` and `dev/proxy/` (squid config, mitmproxy setup, network-isolation script). Nightly runtime cost is similar to the existing integration workflow.
- **Compatibility**: armadactl ignores unknown context keys, so per-context `proxy` fields don't break armadactl sharing the same `~/.armadactl.yaml`. armadactl itself already honours `HTTPS_PROXY` via Go's `ProxyFromEnvironment`, so env-based setups behave the same in both tools.
