## ADDED Requirements

### Requirement: Proxy failures are classified separately from server failures
When a connection goes through a proxy, `testConnection()` and the connection-state classifier SHALL distinguish these failure stages and SHALL NOT report them as "Cannot reach Armada server":

| Stage | Meaning |
|---|---|
| `proxy-connect` | cannot reach the proxy |
| `proxy-auth` | proxy returned 407 |
| `proxy-refused` | proxy returned another non-2xx to CONNECT |
| `tls-untrusted` | certificate chain not trusted while proxied |
| `http2-blocked` | TLS interception without HTTP/2 support |

The `ConnectionTestResult` SHALL include a `stage` field for these cases, and `connectionState` SHALL be `'error'`.

#### Scenario: Proxy unreachable
- **WHEN** the configured proxy refuses the TCP connection
- **THEN** `testConnection()` resolves with `{ ok: false, stage: 'proxy-connect' }` and a message naming the masked proxy URL

#### Scenario: Proxy authentication required
- **WHEN** the proxy answers CONNECT with 407
- **THEN** `testConnection()` resolves with `{ ok: false, stage: 'proxy-auth' }` and a message asking for proxy credentials (or a local forwarder for NTLM/Kerberos)

#### Scenario: Corporate CA not trusted
- **WHEN** a proxied TLS connection fails certificate verification and no `caCertPath` is configured
- **THEN** `testConnection()` resolves with `{ ok: false, stage: 'tls-untrusted' }` and a message recommending `caCertPath`

#### Scenario: Interception breaks HTTP/2
- **WHEN** the proxy intercepts TLS and does not negotiate HTTP/2
- **THEN** `testConnection()` resolves with `{ ok: false, stage: 'http2-blocked' }` and a message recommending an inspection bypass for the Armada host

#### Scenario: Server error behind a working proxy
- **WHEN** the tunnel is established and the Armada server itself returns code 14
- **THEN** the existing "Cannot reach Armada server" classification applies, with the message noting that the proxy tunnel succeeded
