# Tasks: cancel-job-set

- [x] Add `cancelJobSet(queue, jobSetId)` method to `ArmadaClient` using `Submit.CancelJobSet` gRPC
- [x] Create `src/commands/cancelJobSet.ts` with confirmation dialog showing job count
- [x] Register `armada.cancelJobSet` command in `src/extension.ts`
- [x] Add command to `package.json` with `viewItem == jobset` context menu condition
- [x] Handle `PERMISSION_DENIED` gRPC error with a clear user-facing message
