# Contributing to Armada VSCode Extension

Thank you for your interest in contributing! This document provides guidelines and instructions for development.

## Development Setup

### Prerequisites

- Node.js 20.x or higher and npm
- VSCode 1.85.0 or higher
- (Optional) kind + kubectl + helm (to run the Armada Operator demo cluster)

### Getting Started

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Compile the TypeScript code:

   ```bash
   npm run compile
   ```

3. Start the development watcher:

   ```bash
   npm run watch
   ```

4. Press `F5` in VSCode to launch the Extension Development Host

### Project Structure

```
armada-vscode/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── commands/              # Command implementations
│   │   ├── submitJob.ts       # Submit job command
│   │   ├── cancelJob.ts       # Cancel job command
│   │   ├── setupConfig.ts     # Configuration setup
│   │   └── ...
│   ├── config/                # Configuration management
│   │   └── configManager.ts   # Config file reader/writer
│   ├── grpc/                  # gRPC client
│   │   └── armadaClient.ts    # Armada gRPC client
│   ├── providers/             # VSCode providers
│   │   └── jobTreeProvider.ts # Job tree view provider
│   ├── proto/                 # Protobuf definitions
│   │   ├── submit.proto       # Submit service
│   │   └── event.proto        # Event service
│   └── types/                 # TypeScript type definitions
│       ├── config.ts          # Config types
│       └── armada.ts          # Armada types
├── schemas/                   # JSON schemas
│   └── armada-job-schema.json # YAML validation schema
├── examples/                  # Example job files
├── operator/                 # Armada Operator quickstart notes
└── package.json               # Extension manifest

```

## Development Workflow

### Running the Extension

1. Open the project in VSCode
2. Press `F5` to start debugging
3. A new VSCode window will open with the extension loaded
4. Test the extension features

### Making Changes

1. Make your changes to the source code
2. The TypeScript compiler will automatically recompile (if `npm run watch` is running)
3. Press `Ctrl+R` (or `Cmd+R` on Mac) in the Extension Development Host to reload the extension

### Testing with Local Armada

1. Provision the demo cluster (kind + Helm + operator) directly from this repo:

   ```bash
   make up
   ```

2. Verify pods are healthy:

   ```bash
   make status
   ```

3. Point the extension at your `~/.armadactl.yaml` (set the gRPC/HTTP endpoints to the `localhost:3000x` NodePorts)

4. Submit workloads with the sample files under `examples/`

## Code Style

- Use TypeScript strict mode
- Follow ESLint rules (configured in `.eslintrc.json`)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `dev` (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linter: `npm run lint`
5. Run tests: `npm run test`
6. Compile: `npm run compile`
7. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```bash
   git commit -m 'feat: add amazing feature'
   # or
   git commit -m 'fix: resolve issue with job cancellation'
   ```
8. Push to your branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request to the `dev` branch
10. Wait for CI checks to pass

### Conventional Commit Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning and changelog generation:

- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test additions or changes
- `perf:` - Performance improvements

For breaking changes, add `!` after the type: `feat!: redesign configuration API`

### CI/CD Pipeline

All pull requests trigger the CI workflow which:
- Runs ESLint
- Compiles TypeScript
- Runs tests
- Packages the extension

Merging to `main` triggers the release-please workflow which creates release PRs with automated versioning.

## Adding New Features

### Adding a Command

1. Create a new file in `src/commands/` (e.g., `myCommand.ts`)
2. Implement the command function
3. Register the command in `src/extension.ts`
4. Add command to `package.json` under `contributes.commands`

### Adding a Configuration Option

1. Add the setting to `package.json` under `contributes.configuration`
2. Access the setting using `vscode.workspace.getConfiguration('armada').get('settingName')`

### Updating Protobuf Definitions

1. Update or add `.proto` files in `src/proto/`
2. The proto-loader will automatically load them at runtime
3. Update TypeScript types in `src/types/armada.ts` if needed

## Debugging

- Use `console.log()` statements (output appears in Debug Console)
- Set breakpoints in TypeScript files
- Use VSCode's debugger to step through code
- Check the Output panel for extension logs

## Common Issues

### Extension not activating

- Check activation events in `package.json`
- Ensure the extension is properly compiled
- Check for errors in the Debug Console

### gRPC connection errors

- Verify Armada server is running
- Check the server URL in configuration
- Ensure ports are not blocked by firewall

### TypeScript errors

- Run `npm install` to ensure all dependencies are installed
- Run `npm run compile` to check for compilation errors
- Check `tsconfig.json` for configuration issues

## Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Armada Documentation](https://armadaproject.io/docs)
- [gRPC Node.js](https://grpc.io/docs/languages/node/)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
