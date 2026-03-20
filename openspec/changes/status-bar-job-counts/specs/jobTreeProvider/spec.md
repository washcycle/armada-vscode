## MODIFIED Requirements

### Requirement: JobTreeProvider exposes job count getter
`JobTreeProvider` SHALL expose a `getJobCounts(): Record<string, number>` method that returns a map of job state strings to their counts, derived from the current in-memory `jobs` map. This method SHALL NOT make any API calls.

#### Scenario: Counts from in-memory map
- **WHEN** `getJobCounts()` is called after a refresh with 3 running and 2 queued jobs
- **THEN** returns `{ RUNNING: 3, QUEUED: 2 }`

#### Scenario: Empty map when no jobs loaded
- **WHEN** `getJobCounts()` is called before any refresh
- **THEN** returns an empty object `{}`
