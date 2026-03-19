# Tasks: reprioritize-job

- [x] Add `reprioritizeJobs(queue, jobSetId, jobIds, newPriority)` method to `ArmadaClient`
- [x] Create `src/commands/reprioritizeJob.ts` with InputBox pre-filled with current priority
- [x] Warn user if job is not in QUEUED state (reprioritization has no effect on running jobs)
- [x] Handle partial failures from `reprioritization_results` map in response
- [x] Register `armada.reprioritizeJob` command in `src/extension.ts`
- [x] Add command to `package.json` with `viewItem == job` context menu condition
