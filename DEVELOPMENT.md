# Development Guide

This guide will help you get the Armada VSCode extension up and running for development.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs all required packages including:

- TypeScript compiler
- VSCode extension APIs
- gRPC libraries (@grpc/grpc-js, @grpc/proto-loader)
- YAML parser (js-yaml)
- ESLint and development tools

### 2. Compile the Extension

```bash
npm run compile
```

Or start the watcher for automatic recompilation:

```bash
npm run watch
```

### 3. Run the Extension

Press `F5` in VSCode to launch the Extension Development Host. This opens a new VSCode window with your extension loaded.

### 4. Set Up Local Armada (Optional)

Leverage the vendored Helm workflow for the Armada Operator quickstart:

```bash
cd dev
make up            # provisions kind-armada, installs deps, operator, and demo CRs
make status        # inspect pods in armada-system/armada/data
make logs          # follow operator logs (Ctrl+C to exit)
```

Everything runs from this repository: Helm installs the dependencies, the operator chart comes from the `gresearch` repo, and the CRs/values live under `dev/operator/quickstart/`. The NodePorts match the upstream docs, so `~/.armadactl.yaml` can keep pointing at `localhost:3000x`. Run `make down` when you want to uninstall charts and delete the `kind` cluster. See `dev/operator/README.md` for prerequisites and troubleshooting details.

### 5. Test the Extension

1. Open one of the example files: `examples/hello-world.armada.yaml`
2. You should see YAML validation and IntelliSense working
3. Click the cloud upload icon (or run `Armada: Submit Job`) to submit the job
4. Check the "Armada Jobs" view in the sidebar to see the job

## Development Tips

### Debugging

- Set breakpoints in TypeScript files
- Use `console.log()` for debugging (check Debug Console)
- Reload the extension with `Ctrl+R` (or `Cmd+R`) after changes

### Testing Changes

After modifying code:

1. TypeScript will recompile automatically (if watch mode is running)
2. Reload the Extension Development Host (`Ctrl+R` or `Cmd+R`)
3. Test your changes

### Code Organization

- **Commands** (`src/commands/`): User-facing actions
- **Config** (`src/config/`): Configuration file management
- **gRPC** (`src/grpc/`): Armada API client
- **Providers** (`src/providers/`): VSCode UI components
- **Proto** (`src/proto/`): Protobuf service definitions
- **Types** (`src/types/`): TypeScript type definitions

## Available Commands

The extension provides these commands (accessible via Command Palette):

- `Armada: Submit Job` - Submit current YAML file as a job
- `Armada: Refresh Jobs` - Refresh job list
- `Armada: Setup Configuration` - Configure Armada connection
- `Armada: Switch Context` - Switch between Armada clusters
- `Armada: Cancel Job` - Cancel a selected job

## Configuration Options

Extension settings (File → Preferences → Settings → Armada):

- `armada.configPath` - Custom config file path (default: ~/.armadactl.yaml)
- `armada.autoRefresh` - Auto-refresh job status (default: true)
- `armada.refreshInterval` - Refresh interval in ms (default: 5000)
- `armada.maxJobsToShow` - Max jobs to display (default: 100)

## Project Structure

```text
armada-vscode/
├── src/                       # Source code
│   ├── extension.ts          # Main entry point
│   ├── commands/             # Command implementations
│   ├── config/               # Config management
│   ├── grpc/                 # gRPC client
│   ├── providers/            # TreeView providers
│   ├── proto/                # Protobuf definitions
│   └── types/                # TypeScript types
├── schemas/                  # JSON schemas for YAML validation
├── examples/                 # Example Armada job files
├── dev/                      # Development tools and local setup
│   ├── operator/            # Armada Operator quickstart configs
│   ├── scripts/             # Development scripts
│   └── Makefile             # Local cluster automation
├── .vscode/                  # VSCode configuration
│   ├── launch.json          # Debug configuration
│   ├── tasks.json           # Build tasks
│   └── settings.json        # Workspace settings
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript config
└── README.md                # User documentation
```

## Building for Production

To create a `.vsix` package for distribution:

```bash
# Install vsce if you haven't already
npm install -g @vscode/vsce

# Package the extension
npm run package
```

This creates a `.vsix` file that can be installed in VSCode or published to the marketplace.

## Troubleshooting

### Extension not loading

- Check the Debug Console for errors
- Ensure `npm run compile` completes without errors
- Verify `out/extension.js` was created

### gRPC connection issues

- Verify the operator demo is running: `kubectl --context kind-armada get pods -n armada`
- Test connection: `grpcurl -plaintext localhost:30001 list`
- Check firewall settings

### TypeScript errors

- Run `npm install` to ensure dependencies are up to date
- Check `tsconfig.json` configuration
- Look for red squiggles in VSCode

### YAML validation not working

- Verify file has `.armada.yaml` or `.armada.yml` extension
- Check that `schemas/armada-job-schema.json` exists
- Reload VSCode window

## Next Steps

1. Read through the code in `src/extension.ts` to understand the activation flow
2. Explore command implementations in `src/commands/`
3. Try modifying the TreeView provider to add new features
4. Add new commands or configuration options
5. Check out [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines

## Resources

- [VSCode Extension API Docs](https://code.visualstudio.com/api)
- [Armada Documentation](https://armadaproject.io/docs)
- [Armada GitHub](https://github.com/armadaproject/armada)
- [gRPC Node.js Guide](https://grpc.io/docs/languages/node/)
- [Protocol Buffers](https://developers.google.com/protocol-buffers)

## Need Help?

- Open an issue on GitHub
- Check existing issues for similar problems
- Review the Armada documentation
- Ask in the Armada Slack/Discord community
