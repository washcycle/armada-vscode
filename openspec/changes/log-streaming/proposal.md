## Why

Training and long-running jobs produce continuous output. The current static 1000-line snapshot from Binoculars is nearly useless for a job that has been running for hours — the relevant window is either missed or requires constant manual refresh. Users need `kubectl logs -f` semantics without leaving VS Code.

## What Changes

Replace the single-shot `getJobLogs` call in `viewJobLogsCommand` with a polling loop that:
1. Fetches initial logs (last 500 lines)
2. Records the timestamp of the last received log line
3. Polls Binoculars `Logs` RPC with advancing `since_time` parameter every 2–5 seconds (configurable)
4. Appends new lines to the `OutputChannel` incrementally
5. Stops when the job reaches a terminal state or the user closes the output channel

Note: Binoculars only has a unary `Logs` RPC — no server-streaming variant exists. This polling approach is the correct implementation given the current API.

## Perspectives

**Job Submitter**: High value for ML training jobs. `kubectl logs -f` semantics with a live-scrolling output panel. Must handle pod restarts gracefully without dropping the stream. A pause button would be ideal. This eliminates the main reason to keep a terminal open alongside VS Code.

**VS Code Extension**: Create a dedicated `OutputChannel` per job (`Armada Logs: <jobId>`) so multiple jobs stream concurrently without interleaving. Store the poll cancel function in a `Map<jobId, () => void>` — cancel on panel close or context switch. Use `channel.append` (not `appendLine`) for smooth incremental rendering. If job reaches terminal state, do one final fetch then stop polling.

**DevSecOps**: A persistent polling loop creates a connection lifecycle management problem. The extension must cancel polling when: the output channel closes, the user switches context, or the job terminates. Failure to cancel leaves an ongoing authenticated connection to the cluster. Log content from user workloads is untrusted — strip ANSI escape codes before display. Apply a maximum stream duration or session byte cap (e.g. 10MB) to prevent runaway memory consumption.

**Armada Developer**: Binoculars `Logs` RPC has a `since_time` string parameter — pass the ISO 8601 timestamp of the last received `LogLine.timestamp` on each poll iteration. High-precision parsing applies, so format as full RFC3339 with nanoseconds if available. Poll interval of 2–5 seconds is reasonable. For completed jobs, `since_time` will eventually return empty — detect this and stop polling. The `tail_lines` parameter (currently 1000) should be reduced on subsequent calls since only new lines are needed.

## Security Considerations

- Polling must be cancelled on context switch, job terminal state, or channel close
- ANSI escape codes stripped before display to prevent terminal injection sequences
- Maximum session byte cap (10MB) to prevent memory exhaustion from verbose workloads
- Polling respects the same auth context as the initial log fetch

## Capabilities

### Modified Capabilities

- `viewJobLogs`: Streaming/polling mode with incremental append instead of one-shot fetch

## Impact

- `src/commands/viewJobLogs.ts` — rewrite fetch logic to polling loop with cancellation
- `src/grpc/armadaClient.ts` — expose `since_time` parameter in `getJobLogs`
- `package.json` — add `armada.logs.pollIntervalSeconds` setting (default: 3)
