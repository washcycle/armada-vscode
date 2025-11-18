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

### From Marketplace

*Coming soon*

## Quick Start

### 1. Configure Armada Connection

Run the command `Armada: Setup Configuration` or create `~/.armadactl.yaml`:

```yaml
currentContext: local
contexts:
  - name: local
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
- Node.js 18.x or higher
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
