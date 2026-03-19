## Why

Cordoning a queue pauses job acceptance without killing running jobs — the standard operator action before cluster maintenance or capacity rebalancing. The `Queue.cordoned` boolean already exists in `src/types/armada.ts` and the Armada gRPC API exposes `CordonQueue`/`UncordonQueue` RPCs, but there is no UI for either operation. Platform engineers must use `armadactl` CLI to perform this.

## What Changes

Add cordon/uncordon as context-menu commands on queue tree nodes:
1. Create a `QueueItem` tree node type (if not already a first-class tree node)
2. Register `armada.cordonQueue` and `armada.uncordonQueue` commands with `when: "viewItem == queue"`
3. Show a `$(lock)` ThemeIcon on cordoned queues; `$(unlock)` on active
4. Require a confirmation dialog before cordoning: "No new jobs will be scheduled on queue X until uncordoned"
5. Wire to `QueueService.CordonQueue` / `QueueService.UncordonQueue` gRPC RPCs

## Perspectives

**Job Submitter**: Low daily value for regular submitters — this is an admin operation. But knowing a queue is cordoned (and why) would prevent the confusion of "why are my jobs not scheduling?" Surfacing cordon status as a visible icon on the queue node is valuable even without the commands.

**VS Code Extension**: Toggle `$(lock)` / `$(unlock)` ThemeIcon on the queue tree item based on `Queue.cordoned`. Confirmation dialog is essential — pausing a production queue is high-impact. Register `armada.cordonQueue` and `armada.uncordonQueue` as separate commands (not a toggle) for clarity and keyboard shortcut assignment.

**DevSecOps**: Highest-privilege queue operation. Must confirm the Armada API enforces RBAC server-side — the extension cannot be the sole enforcement point. `PERMISSION_DENIED` must surface as a clear human-readable error. Confirmation dialog must name the queue and explicitly state the effect. Audit log to output channel with timestamp, context name, and queue name on every cordon/uncordon action.

**Armada Developer**: `CordonQueue` and `UncordonQueue` are on `QueueService`, which is a **separate gRPC service** from `Submit` — both are defined in `submit.proto` but require instantiating `submitProto.api.QueueService` on the same address/credentials. The current `armadaClient.ts` only initializes `Submit`. Cordon is per-queue, not per-pool — other queues on the same pool remain active. `GetQueue` returns current `cordoned` state so you can check before displaying the command option.

## Security Considerations

- Cluster-wide admin operation — server RBAC must be the enforcement point
- `PERMISSION_DENIED` must surface as explicit permission error, not generic failure
- Strong confirmation dialog: "No new jobs will be scheduled on queue [name] until uncordoned. Continue?"
- Audit log entry required: timestamp, context, queue name, action (cordon/uncordon)

## Capabilities

### New Capabilities

- `cordon-uncordon-queue`: Pause/resume job scheduling on a queue with visual cordon status indicator

### Modified Capabilities

- `armadaClient`: Add `cordonQueue(name)` and `uncordonQueue(name)` methods using `QueueService`

## Impact

- `src/commands/cordonQueue.ts` — new file
- `src/grpc/armadaClient.ts` — add `QueueService` client initialization and cordon methods
- `src/providers/queueTreeProvider.ts` (or jobTreeProvider) — `QueueItem` with cordon state icon
- `package.json` — register commands with `viewItem == queue` context condition
