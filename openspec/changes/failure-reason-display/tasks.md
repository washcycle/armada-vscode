# Tasks: failure-reason-display

- [x] Add `failureReason?: string` and `failureCategory?: string` to `JobInfo` in `src/types/armada.ts`
- [x] Parse `JobFailedEvent` in `convertEventFromProto()` to extract `Cause` enum and container exit reasons
- [x] Parse `JobPreemptedEvent` as distinct failure category
- [x] Categorize failure into: OOM, Evicted, ImagePull, Preempted, Rejected, UserError
- [x] Update `JobItem.updateDisplay()` to show failure reason as `TreeItem.description` for failed jobs
