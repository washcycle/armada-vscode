## Context

The extension makes two kinds of outbound connections:

| Path | Library | Proxy behaviour today |
|---|---|---|
| Submit / Event / Jobs / Binoculars | `@grpc/grpc-js` 1.14 (HTTP/2) | Reads **lowercase** `grpc_proxy` → `https_proxy` → `http_proxy` and `no_grpc_proxy` / `no_proxy` from `process.env` when a channel is created. Supports only `http://` proxy URLs and Basic auth from URL userinfo, via HTTP CONNECT. **Ignores** VS Code `http.proxy`, uppercase `HTTPS_PROXY` / `NO_PROXY`, and has **no public option** to supply a proxy explicitly. The only public knob is `grpc.enable_http_proxy` (on/off). |
| Lookout v2 REST | Node `http` / `https` | VS Code's extension host patches these modules when `http.proxySupport` is `override` (the default), so they **usually** follow `http.proxy`. That behaviour is implicit, not tested, and differs from gRPC. |

`main` already supports TLS-inspecting proxies through `caCertPath` (context or the `armada.caCertPath` setting), applied to gRPC (`createSsl(rootCerts)`) and Lookout.

People involved: users on corporate networks (Zscaler, Netskope, Blue Coat, squid), maintainers, and armadactl users sharing `~/.armadactl.yaml`.

## Goals / Non-Goals

**Goals:**
- One resolved proxy decision per endpoint, applied identically to gRPC and Lookout.
- Works with the configuration users already have: VS Code `http.proxy` / `http.noProxy`, and upper- or lower-case env vars.
- Explicit override per context and per workspace.
- Clear diagnostics: show which proxy is in use and why, and which stage failed.
- A CI workflow that proves the extension works through a real proxy with no direct egress.

**Non-Goals:**
- NTLM / Kerberos / Negotiate proxy auth. Users run a local forwarder (cntlm, px) and point the extension at it.
- PAC files / WPAD auto-discovery. We may reuse VS Code's resolver later (see Open Questions).
- SOCKS proxies.
- Changing armadactl behaviour.

## Decisions

### D1. A single `resolveProxy(endpointUrl, sources)` in `src/net/proxy.ts`
It is a pure function (no `vscode` import), unit-testable like `config/resolver.ts`. Inputs are the per-context `proxy` / `noProxy`, the `armada.proxy` setting, VS Code `http.proxy` / `http.noProxy` / `http.proxyStrictSSL`, and the env. The output is:

```
{ proxyUrl?: URL, source: 'context'|'setting'|'vscode'|'env'|'none', bypassed: boolean, bypassRule?: string }
```

Precedence is context → setting → VS Code → env. `armada.proxy: "off"` disables proxying entirely, and `"inherit"` (the default) falls through. Env lookup checks lowercase first, then uppercase (`https_proxy`, `HTTPS_PROXY`, then `http_proxy`, `HTTP_PROXY`), matching curl and Go.
- *Alternative:* keep relying on env vars only. Rejected: it's the status quo, which fails for VS Code-configured proxies.
- *Alternative:* read VS Code's resolved proxy per URL via the proposed `vscode.env` proxy API. Not stable in our engine range; revisit for PAC (see Open Questions).

### D2. `NO_PROXY` semantics follow curl/Go
Comma-separated entries. `*` matches everything. `.example.com` matches subdomains. `example.com` matches the host and its subdomains. Entries can be IP literals or CIDRs, with an optional `:port`. `localhost`, `127.0.0.0/8` and `::1` always bypass. This is a shared implementation, so gRPC and Lookout can never disagree.

### D3. Injecting the proxy into gRPC: spike first, two candidate mechanisms
grpc-js offers no public explicit-proxy option. Internally its `mapProxyName` rewrites the channel target to the proxy address and sets `grpc.http_connect_target` (and `grpc.http_connect_creds`) channel options, which the transport turns into an HTTP CONNECT.
- **Option A (preferred if the spike confirms it):** create channels with target = the proxy `host:port` and options `{ 'grpc.http_connect_target': <armada target>, 'grpc.http_connect_creds': <base64 user:pass>, 'grpc.enable_http_proxy': 0 }`, plus `grpc.ssl_target_name_override` / `grpc.default_authority` set to the Armada host so TLS SNI and certificate verification still target Armada, not the proxy. This uses internal option names, so pin the grpc-js minor version and add a contract test that fails on upgrade if the mechanism stops working. The CI proxy workflow (D7) is the end-to-end guard.
- **Option B (fallback):** keep grpc-js's env path. Temporarily set lowercase `grpc_proxy` / `no_grpc_proxy` in `process.env` around the synchronous `new Client(...)` call and restore them immediately. grpc-js reads env in `getProxyInfo()` at channel creation, and construction is synchronous, so no other extension observes the change. It's hacky, but it relies only on documented env behaviour.
- When the endpoint is bypassed or no proxy resolves, set `grpc.enable_http_proxy: 0`, so a stray env var can't override an explicit `off`.
- *Rejected:* swapping to `@grpc/grpc-js` forks or a custom socket factory. Too much surface.

### D4. Lookout gets an explicit agent
Construct `https-proxy-agent` / `http-proxy-agent` from the resolved proxy (respecting bypass) and pass it per request. This stops relying on VS Code's monkey-patching, so behaviour matches gRPC and is testable outside VS Code. Combine it with the `caCertPath` CA bundle.

### D5. Credentials
Proxy credentials live only in the URL (`http://user:pass@proxy:3128`). Every display and log path uses `maskProxyUrl()` (`http://user:****@proxy:3128`). Explicit `armada.proxy` URLs containing credentials trigger a one-time suggestion to use env vars or a local forwarder instead of settings sync. `Proxy-Authorization` is sent only to the proxy, never to Armada.

### D6. Failure classification (connection-health)
Map observed errors to stages:
- **Proxy connect refused / timeout:** CONNECT socket error before any response. grpc-js reports UNAVAILABLE with "Failed to connect to HTTP proxy" details.
- **Proxy auth (407):** CONNECT response 407. Details contain "407".
- **Proxy refused the tunnel (403 / other non-200):** CONNECT response code.
- **Untrusted interception CA:** TLS error `SELF_SIGNED_CERT_IN_CHAIN` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` while a proxy is in use → suggest `caCertPath` (reuses the existing caCerts hint).
- **HTTP/2 blocked by an interceptor:** ALPN negotiated `http/1.1` or the tunnel is reset after the TLS handshake → "your proxy inspects TLS but does not support HTTP/2 (gRPC). Ask for an inspection bypass for <host>".

Each stage gets a distinct message. The `connectionState` stays `'error'`, but the message names the proxy.

### D7. Separate CI workflow `proxy-tests.yml`
- Nightly + `workflow_dispatch`. Reuses the kind/Helm setup from `integration-tests.yml` via `workflow_call`, adding a `proxy_mode` input.
- **Isolation:** the test runner runs in a Docker network with no default route. Only the proxy container sits on both the isolated network and the kind network, so a missed proxy setting fails loudly instead of silently connecting directly.
- **Matrix:**
  - `connect`: squid, CONNECT only, Basic auth
  - `connect-noauth`: squid
  - `intercept`: mitmproxy in regular mode with a generated CA passed via `caCertPath`; asserts HTTP/2 passes through
  - `env-uppercase`: configured only via `HTTPS_PROXY` / `NO_PROXY`
- Each leg asserts in the proxy access log that the Armada and Binoculars hosts were tunnelled. That proves the proxy was used, not just that tests passed.
- Not part of per-PR CI because it costs a kind cluster per leg. Fast unit coverage (D1/D2, plus an in-process CONNECT proxy for gRPC and Lookout) runs in per-PR CI.

## Risks / Trade-offs

- **grpc-js internal options (Option A) change between versions** → pin the minor version, add a contract test that fails on upgrade, keep Option B as a fallback, and let Renovate majors/minors of grpc-js require review.
- **TLS inspection breaks HTTP/2 regardless of what we do** → we can only detect and explain it (D6); document the bypass request for IT.
- **Behaviour change for users whose Lookout currently works via VS Code patching and who set `http.proxySupport: off`** → honour `http.proxySupport: off` by treating it as `armada.proxy: off` unless the context or setting explicitly sets a proxy.
- **Credentials in settings may sync across machines** → warn (D5); prefer env.
- **CI isolation is complex and can flake** → keep the proxy legs out of the required checks, retry once, and upload proxy logs as artifacts.

## Migration Plan

Additive. With no proxy configured anywhere, `resolveProxy` returns `none` and the client sets `grpc.enable_http_proxy: 0` only when the user chose `off`. Otherwise the current env-based behaviour is preserved. Ship behind no flag. Rollback means reverting the release, because no persisted state changes.

## Open Questions

- Do we want PAC support via VS Code's resolver (`vscode.workspace.fetch` / the proposed proxy API) once it's stable in the supported engine range?
- Should `armada.proxy` be machine-scoped (`"scope": "machine"`) so it doesn't sync? Leaning yes.
- Option A vs B for gRPC is decided by the spike (task 1.x).
