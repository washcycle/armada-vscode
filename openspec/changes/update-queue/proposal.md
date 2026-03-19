## Why

Queue priority factors and ownership groups are administrative settings that currently require the `armadactl` CLI to change. The extension can create queues but not update them. Platform engineers who manage queues should be able to do so from within VS Code, consistent with the create-queue command already present.

## What Changes

Register `armada.updateQueue` as a context-menu command on queue tree nodes. The command:
1. Fetches current queue state via `GetQueue` (pre-populate all fields)
2. Presents an input flow (same pattern as `createQueueCommand`) showing current values
3. Merges user changes with the existing full queue object
4. Calls `Submit.UpdateQueue` or `QueueService.UpdateQueue` gRPC with the full merged `Queue` message
5. Shows a before/after diff of changed fields in the confirmation step

**Critical**: `UpdateQueue` is a full replace — not a patch. All fields must be round-tripped from `GetQueue` before sending, or existing settings (especially `permissions`) will be silently cleared.

## Perspectives

**Job Submitter**: Low personal use — this is an admin workflow. Platform engineers will use it. Done well it eliminates the need to remember `armadactl` syntax for routine changes.

**VS Code Extension**: Multi-step `QuickPick`/`InputBox` flow pre-populated with current values fetched via `getQueue`. Expose only commonly changed fields (priority factor, user/group owners) to keep the form manageable. Show a confirmation step summarizing what will change before the RPC call. Follow the existing `createQueueCommand` pattern closely for consistency.

**DevSecOps**: Changing priority factor affects fair-share scheduling across all tenants. Full-replace semantics make this dangerous if not implemented carefully — clearing `permissions` silently removes access control. Require a diff preview showing before/after before confirmation. Confirm whether the API supports field masks (partial update) — if it does, prefer that over full replace. `PERMISSION_DENIED` must surface clearly.

**Armada Developer**: `UpdateQueue` is a full `Queue` proto replace — you MUST call `GetQueue` first to read current state, then send all fields back including any you didn't change. Particularly dangerous for `permissions`, `resource_limits_by_priority_class_name`, and `labels` which may be set by cluster administrators and not visible to the user. Consider exposing only `priority_factor`, `user_owners`, and `group_owners` in the UI and preserving all other fields transparently via the round-trip.

## Security Considerations

- Full replace semantics: must round-trip ALL fields from `GetQueue` before sending `UpdateQueue`
- Diff preview required before confirmation — show exactly what will change
- `PERMISSION_DENIED` must surface as an explicit error, not generic failure
- Do not expose `permissions` field in the form — preserve it from `GetQueue` transparently

## Capabilities

### New Capabilities

- `update-queue`: Modify queue priority factor and ownership from VS Code with safe full-replace semantics

### Modified Capabilities

- `armadaClient`: Add `updateQueue(queue: Queue)` method

## Impact

- `src/commands/updateQueue.ts` — new file
- `src/grpc/armadaClient.ts` — add `updateQueue` method
- `package.json` — register command with `viewItem == queue` context condition
