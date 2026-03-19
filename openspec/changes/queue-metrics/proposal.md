## Why

Platform engineers need to know a queue's current load before making scheduling decisions — how many jobs are waiting, how much resource capacity is allocated, whether the queue is near its limits. This context currently requires either the Lookout web UI or direct Prometheus queries. A lightweight metrics tooltip on queue tree nodes would surface the most actionable information inline.

## What Changes

Show queue metrics as a tooltip or inline `description` on queue tree nodes, populated from two sources:

1. **Config metrics** (from `GetQueue` gRPC): priority factor, resource limits by priority class, cordon status — already available, just not displayed
2. **Depth counts** (from Lookout v2): QUEUED count and RUNNING count for the queue via `POST /api/v1/jobs` with state filters

Display format: `Priority: 1.5 | Queued: 23 | Running: 7 | GPU limit: 100`

Note: actual CPU/memory utilization vs. requested is not available from the Armada API — it lives in Prometheus. Label displayed values accurately as "requested" not "utilized."

## Perspectives

**Job Submitter**: Medium value — knowing queue depth before submitting a 16-GPU job helps decide whether to wait or use a different queue. Ideal as a tooltip on the queue node, not a separate panel requiring navigation.

**VS Code Extension**: Display as `vscode.MarkdownString` tooltip on `QueueItem`. Fetch queue config from `getQueue` (already implemented) and depth counts from `LookoutClient` (two queries: QUEUED and RUNNING state filters with `take=1`). Cache results for 30s to avoid hammering the API on every hover. The `TreeItem.tooltip` property accepts `MarkdownString` — use a small table format.

**DevSecOps**: Queue depth and utilization data may reveal information about other tenants' workloads in multi-tenant environments. Confirm whether Armada API enforces per-user scoping on queue metrics or returns cluster-wide aggregates to all authenticated users. Document what access level is required to view queue metrics. This feature is blocked on `fix-browse-job-sets-url` (Lookout auth and TLS must be resolved first).

**Armada Developer**: `Submit.GetQueue` returns queue config including `resource_limits_by_priority_class_name` and `priority_factor` — static policy data. Live depth counts require Lookout v2 queries with state filters scoped to a queue (`field: "queue", match: "exact"`). There is no Armada API that returns resource utilization vs. limits in a single call — that data lives in Prometheus, not in the gRPC/REST API. Label displayed values as "requested" to avoid misleading operators.

## Security Considerations

- Blocked on `fix-browse-job-sets-url`: Lookout auth and TLS must be fixed first
- Confirm multi-tenant visibility: does `GetQueue` return data accessible to all authenticated users?
- Cache metrics to avoid continuous polling on hover (30s TTL minimum)
- Label all values as "requested" not "actual utilization" to prevent misleading capacity decisions

## Capabilities

### New Capabilities

- `queue-metrics`: Inline queue depth and config metrics on queue tree nodes

## Impact

- `src/providers/jobTreeProvider.ts` (or `queueTreeProvider.ts`) — fetch and cache queue metrics for tooltip
- `src/api/lookoutClient.ts` — add state-scoped job count query
- Blocked on: `fix-browse-job-sets-url` (Lookout auth/TLS required)
