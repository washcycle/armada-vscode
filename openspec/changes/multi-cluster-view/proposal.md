## Why

Armada is explicitly a multi-cluster scheduler — jobs are assigned to clusters at scheduling time, and each cluster runs a Binoculars instance for logs. The extension currently supports only one active context at a time. Operators who manage workloads across dev, staging, and production clusters must switch contexts manually, losing visibility into other clusters. A unified tree view would show all clusters simultaneously.

## What Changes

Extend `ConfigManager` to support multiple simultaneous active contexts (currently resolves to exactly one). Hold a `Map<contextName, ArmadaClient>` and group job sets by cluster in the tree view:

```
Armada Jobs
├── prod-cluster
│   ├── ml-jobs / training-run-42 (3 running, 1 failed)
│   └── ml-jobs / sweep-99 (12 succeeded)
└── dev-cluster
    └── test-jobs / ci-run-7 (1 running)
```

Each `ArmadaClient` instance is fully independent — separate gRPC connections, separate credentials, separate event streams.

**This is the most architecturally invasive change in the extension** — treat as a major version change.

## Perspectives

**Job Submitter**: Low personal use — most submitters work against a single cluster. Useful for platform teams. Done well it's a unified tree with cluster as the top-level grouping rather than a fundamentally different UI mode, so it degrades cleanly for single-cluster users.

**VS Code Extension**: Extend `ConfigManager` to resolve multiple contexts simultaneously. Hold a `Map<contextName, ArmadaClient>`. Either instantiate a `JobTreeProvider` per context (complex) or add `contextName` as a label to `JobSetItem` and merge all clients' events into one provider. Add a cluster prefix to all tree node labels to prevent confusion. Job IDs are only unique within a cluster — tree must always include cluster name.

**DevSecOps**: Most significant security architecture change in the feature list. Multiple cluster credentials held simultaneously in the same VS Code process. A `forceNoTls` setting on a dev cluster must not affect the production cluster's client. Each `ArmadaClient` instance must be fully isolated — no shared state. The UI must clearly label which cluster each piece of data comes from. Context-switching must cancel event streams from the previously active cluster before opening new ones.

**Armada Developer**: Armada's scheduler is multi-cluster — all job submission, events, and state live in a single Armada server (Pulsar backend). Job-to-cluster assignment is recorded in `JobRunDetails.cluster` from `GetJobDetails`. To show a cross-cluster view, group already-loaded `JobRunDetails` by the `cluster` field — no additional API calls if job details are already fetched. The `binocularsUrlPattern` config (already present in the codebase) handles routing log requests to per-cluster Binoculars instances.

## Security Considerations

- Each `ArmadaClient` must be fully isolated — no shared state, credentials, or event streams
- `forceNoTls` on one context must not propagate to other contexts
- UI must clearly label all data with its source cluster — production vs dev confusion is a serious operational risk
- Context-switching must cleanly cancel all event streams from the previous context before starting new ones
- Credential storage: each context's credentials stored independently in the resolved config

## Capabilities

### New Capabilities

- `multi-cluster-view`: Unified job tree showing jobs across multiple Armada clusters simultaneously

### Modified Capabilities

- `configManager`: Support for multiple simultaneously-active contexts
- `jobTreeProvider`: Cluster-grouped tree structure with fully independent per-cluster clients

## Impact

- `src/config/configManager.ts` — major change: multi-context resolution
- `src/grpc/armadaClient.ts` — `Map<contextName, ArmadaClient>` management
- `src/providers/jobTreeProvider.ts` — cluster-level grouping in tree hierarchy
- `src/extension.ts` — multi-client initialization and lifecycle management
- `package.json` — add `armada.activeClusters: string[]` config array
