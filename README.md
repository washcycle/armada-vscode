# Armada VSCode Extension

A Visual Studio Code extension for [Armada](https://armadaproject.io/), the multi-Kubernetes cluster batch job scheduler.

## Features

- **Job Submission**: Submit Armada jobs directly from YAML files in VSCode
- **Job Management**: View, monitor, and cancel jobs from the sidebar
- **Queue Browsing**: Browse and filter Armada queues and job sets
- **Real-time Updates**: Auto-refresh job status with configurable intervals
- **YAML Validation**: IntelliSense and schema validation for Armada job definitions
- **Multi-Context Support**: Switch between different Armada clusters
- **Job Logs**: View job logs directly in VSCode
- **gRPC Integration**: Native gRPC client for fast communication with Armada API

## Installation

### From VSIX (Development)

1. Package the extension:

   ```bash
   npm install
   npm run compile
   npm run package
   ```

2. Install the generated `.vsix` file in VSCode:
   - Open VSCode
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type "Install from VSIX" and select the file

## Quick Start

### 1. Configure Armada Connection

Run the command `Armada: Setup Configuration` or create `~/.armadactl.yaml`:

```yaml
currentContext: local
contexts:
  local:
    armadaUrl: localhost:30002
    execTimeout: 2m
```

### 2. Submit a Job

1. Create a file with `.armada.yaml` extension (e.g., `hello-world.armada.yaml`)
2. Write your job definition:

   ```yaml
   queue: default
   jobSetId: my-job-set
   jobs:
     - priority: 1000
       namespace: default
       podSpec:
         containers:
           - name: hello
             image: busybox
             command: ["echo", "Hello from Armada!"]
   ```

3. Click the cloud upload icon in the editor or run `Armada: Submit Job`

Each job needs a pod spec with at least one container. Both spellings
`armadactl` accepts work: `podSpec:` for a single spec, or `podSpecs:` as a list
for a gang. The pod spec is a standard Kubernetes `PodSpec`, so fields such as
`priorityClassName`, `securityContext`, `initContainers`, `volumes`,
`tolerations` and `imagePullSecrets` are all forwarded as written. Any key that
is not part of `PodSpec` is reported in the **Armada** output channel rather than
ignored, which catches typos like `imagePullPolcy`.

### 3. Monitor Jobs

- Open the Armada sidebar (activity bar icon)
- View running and completed jobs
- Click on a job to see details
- Use the refresh button to update job status

## Available Commands

Access these commands via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Armada: Submit Job` | Submit the current YAML file as an Armada job |
| `Armada: Refresh Jobs` | Manually refresh the job list |
| `Armada: Refresh Jobs (Query API)` | Refresh jobs using the Query API |
| `Armada: Setup Configuration` | Configure Armada connection settings |
| `Armada: Switch Context` | Switch between configured Armada clusters |
| `Armada: Cancel Job` | Cancel a selected job |
| `Armada: View Job Logs` | View logs for a selected job |
| `Armada: Browse Queues` | Browse all available queues |
| `Armada: Browse Active Queues` | Browse queues with active jobs |
| `Armada: Load Job Set` | Load a specific job set for monitoring |
| `Armada: Browse Job Sets` | Browse and filter job sets |
| `Armada: Clear All Monitored Job Sets` | Clear the list of monitored job sets |

## Configuration

Configure the extension in VSCode Settings (`File → Preferences → Settings → Armada`):

| Setting | Default | Description |
|---------|---------|-------------|
| `armada.configPath` | `~/.armadactl.yaml` | Path to armadactl configuration file |
| `armada.autoRefresh` | `true` | Automatically refresh job status |
| `armada.refreshInterval` | `5000` | Auto-refresh interval in milliseconds |
| `armada.maxJobsToShow` | `100` | Maximum number of jobs to display |
| `armada.useSystemCertificates` | `true` | Trust CA certificates from the OS certificate store (Windows store, macOS keychain, Linux system bundle). See [Corporate networks](#corporate-networks-and-vpns) |
| `armada.caCertPath` | *(empty)* | PEM CA bundle to trust for TLS, in addition to the bundled and OS roots. See [Corporate networks](#corporate-networks-and-vpns) |

### Connection URLs and TLS

`armadaUrl`, `binocularsUrl` and `binocularsUrlPattern` accept `host:port`,
`http://host:port`, `https://host:port`, IPv6 literals (`[::1]:30002`) and
gRPC `dns:` targets. Scheme case, surrounding whitespace and trailing slashes
are ignored.

TLS follows armadactl, so a context shared between both tools behaves the same:

| `armadaUrl` | Transport |
|---|---|
| `forceNoTls: true` on the context | plaintext |
| `https://…` | TLS |
| `http://…` | plaintext |
| `…:443` | TLS |
| `localhost`, `*.localhost`, `127.x.x.x`, `[::1]` | plaintext |
| anything else, e.g. `armada.example.com:50051` | **TLS** |

To talk plaintext to a remote server, use `http://host:port` or set
`forceNoTls: true`. The config panel (**Armada: Show Configuration**) shows the
mode in effect and why.

### Corporate networks and VPNs

#### TLS-inspecting proxies (Zscaler, Netskope, company CAs)

On networks that run a TLS-inspecting proxy, the certificate the extension
actually receives is re-signed by the proxy's CA. Node.js does not ship that
CA, so without it every connection fails, usually as `UNAVAILABLE` with
`unable to verify the first certificate` or
`self signed certificate in certificate chain`.

**Usually nothing to configure.** IT normally installs the proxy CA in the
operating system's trust store (the Windows certificate store, the macOS
keychain, or the Linux system bundle), and the extension trusts that store by
default (`armada.useSystemCertificates`). The **Armada** output channel
(`View → Output → Armada`) logs how many OS certificates were added on top of
the bundled roots. This needs a VS Code build on Node 22.15 or newer; on
older builds, use `armada.caCertPath` below.

**If the CA is not in the OS store**, or you turned
`armada.useSystemCertificates` off, point `armada.caCertPath` at your
organisation's CA bundle:
Point `armada.caCertPath` at your organisation's CA bundle:

```jsonc
// .vscode/settings.json, or your user settings
{
  "armada.caCertPath": "~/certs/corporate-ca.pem"
}
```

The bundle is added to the built-in and OS roots rather than replacing them,
so publicly-signed endpoints keep working. A leading `~` is expanded.

Both the gRPC connection to the Armada server and the HTTPS connection to
Lookout use the bundle. Certificate problems are reported in the
**Armada** output channel (`View → Output → Armada`), including how many extra
certificates were loaded.

**Getting a PEM bundle**

The file must be PEM (`-----BEGIN CERTIFICATE-----` blocks); a DER-encoded
`.crt` will be rejected with a conversion hint. Multiple certificates can be
concatenated into one file, and you generally want the whole chain.

```bash
# macOS: export everything in the system keychain
security export -t certs -f pemseq \
  -k /Library/Keychains/System.keychain > ~/certs/corporate-ca.pem

# Linux: the distro bundle usually already contains company CAs
cp /etc/ssl/certs/ca-certificates.crt ~/certs/corporate-ca.pem

# Convert a DER/.crt file your IT team gave you
openssl x509 -inform der -in corporate-ca.crt -out ~/certs/corporate-ca.pem

# Capture the chain a proxy presents for your Armada server
openssl s_client -showcerts -connect armada.example.com:443 </dev/null \
  2>/dev/null > ~/certs/corporate-ca.pem
```

A `caCertPath` set on the active `armadactl` context takes precedence over this
setting, so per-cluster bundles are possible:

```yaml
currentContext: corp
contexts:
  corp:
    armadaUrl: https://armada.example.com
    caCertPath: ~/certs/corporate-ca.pem
```

**The certificate is trusted but calls still fail.** gRPC needs HTTP/2 end to
end. Some inspection setups do not pass HTTP/2 through, or reset long-lived
streams (job event watching). The symptoms are `UNAVAILABLE` or
`Received RST_STREAM` errors without any certificate message. Ask IT to exempt
the Armada and Binoculars hosts from SSL inspection (an inspection *bypass*
rule, which still routes the traffic through the proxy). Lookout is plain
HTTPS and is usually fine inspected.

**Explicit proxies and PAC files.** Lookout requests go through VS Code's own
networking, so they follow `http.proxy` and the system/PAC proxy settings. The
gRPC connection to Armada does not; it only honours the lowercase environment
variables `grpc_proxy`, `https_proxy`, `http_proxy` and `no_proxy` in the
environment VS Code was started from. Built-in proxy support for gRPC is
planned (`openspec/changes/corporate-proxy-support`).

#### Tailscale and other VPNs

A server reached over Tailscale is a remote host as far as TLS is concerned,
so a scheme-less `armadaUrl` uses TLS (see the table above). Pick whichever of
these matches how the server is exposed:

- **Plaintext over the tailnet.** WireGuard already encrypts the traffic, so
  this is the simplest option. Use an explicit `http://` scheme (or
  `forceNoTls: true`) with the MagicDNS name or the `100.x.y.z` address:

  ```yaml
  contexts:
    homelab:
      armadaUrl: http://armada-server:50051
      binocularsUrl: http://armada-server:50053
      lookoutUrl: http://armada-server:10000
  ```

- **HTTPS with a `*.ts.net` name** (Tailscale Serve, or the Tailscale
  Kubernetes operator's ingress). These certificates come from Let's Encrypt,
  so they are publicly trusted and need no `caCertPath`. Use
  `https://<name>.<tailnet>.ts.net`. The proxy in front of Armada must forward
  HTTP/2, because gRPC does not work over HTTP/1.1. Each service gets its own
  hostname, so set `binocularsUrl` explicitly instead of relying on the
  derived `armadaUrl` port + 2.

**Zscaler and Tailscale together.** Zscaler Client Connector can capture
traffic meant for the tailnet. If tailnet hosts time out only while Zscaler is
on, ask IT to exclude `100.64.0.0/10` (Tailscale's address range) and
`*.ts.net` from the Zscaler tunnel and from SSL inspection.

## Local Development Setup

Want to run a local Armada cluster for testing? We provide a complete development environment:

```bash
cd dev
make up      # Start local Armada cluster with kind
make status  # Check cluster status
make logs    # View operator logs
make down    # Tear down the cluster
```

This creates a local Kubernetes cluster with Armada installed and ready to use. See [`operator/README.md`](operator/README.md) for details.

## Development

See [`DEVELOPMENT.md`](DEVELOPMENT.md) for detailed development instructions.

### Quick Development Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Start watch mode for auto-recompilation
npm run watch

# Press F5 in VSCode to launch Extension Development Host
```

### Running Tests

```bash
# Run integration tests
npm test
```

The integration tests verify all extension commands and can run against a local Armada instance. See [`src/test/README.md`](src/test/README.md) for more details.
## CI/CD

This project uses GitHub Actions for automated building, testing, and publishing:

- **CI Workflow**: Automatically runs on pull requests to validate code quality, run tests, and build the extension
- **Release Please**: Manages versioning and changelogs using [Conventional Commits](https://www.conventionalcommits.org/)
- **Publish Workflow**: Automatically publishes new releases to the VS Code Marketplace

See [`.github/workflows/README.md`](.github/workflows/README.md) for detailed workflow documentation.

### Release Process

1. Make changes on feature branches
2. Create PR to `dev` branch with conventional commit messages
3. Merge approved PRs to `dev`
4. Merge `dev` to `main` when ready for release
5. Release Please creates a release PR with auto-generated changelog
6. Merge the release PR to trigger publication to the marketplace

## Project Structure

```
armada-vscode/
├── src/                    # TypeScript source code
│   ├── commands/          # Command implementations
│   ├── config/            # Configuration management
│   ├── grpc/              # gRPC client
│   ├── providers/         # TreeView providers
│   ├── proto/             # Protobuf definitions
│   └── types/             # TypeScript types
├── schemas/               # JSON schemas for YAML validation
├── examples/              # Example job files
├── dev/                   # Development tools
│   ├── operator/         # Local Armada operator setup
│   ├── scripts/          # Development scripts
│   └── Makefile          # Local cluster automation
└── resources/             # Extension resources (icons, etc.)
```

## Requirements

- VSCode 1.85.0 or higher
- Node.js 20.x or higher (for development)
- Access to an Armada cluster (or use the local development setup)

## Contributing

Contributions are welcome! Please see [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

## Resources

- [Armada Documentation](https://armadaproject.io/docs)
- [Armada GitHub](https://github.com/armadaproject/armada)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [Issue Tracker](https://github.com/washcycle/armada-vscode/issues)

## License

See [`LICENSE`](LICENSE) for details.

## Support

- Open an issue on GitHub
- Join the Armada community: [![slack](https://img.shields.io/badge/slack-armada-brightgreen.svg?logo=slack)](https://cloud-native.slack.com/?redir=%2Farchives%2FC03T9CBCEMC)
