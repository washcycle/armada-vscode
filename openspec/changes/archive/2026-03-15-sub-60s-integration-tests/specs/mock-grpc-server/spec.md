## ADDED Requirements

### Requirement: Mock gRPC server implements Armada Submit service
The mock server SHALL implement the Submit service handlers from `pkg/api/submit.proto` with canned responses.

#### Scenario: SubmitJobs returns job IDs
- **WHEN** a client calls `SubmitJobs` with a valid job request
- **THEN** the server SHALL return a response with one `job_response_items` entry per submitted job, each containing a generated job ID

#### Scenario: CancelJobs succeeds
- **WHEN** a client calls `CancelJobs` with a job ID
- **THEN** the server SHALL return an empty cancellation result

#### Scenario: GetQueue returns queue details
- **WHEN** a client calls `GetQueue` with a queue name
- **THEN** the server SHALL return a Queue object with the requested name and default resource limits

#### Scenario: CreateQueue succeeds
- **WHEN** a client calls `CreateQueue` with a Queue object
- **THEN** the server SHALL return an empty success response

### Requirement: Mock gRPC server implements Armada Event service
The mock server SHALL implement the Event service from `pkg/api/event.proto`.

#### Scenario: GetJobSetEvents streams events
- **WHEN** a client calls `GetJobSetEvents` with a queue and job set ID
- **THEN** the server SHALL stream a sequence of events (submitted → queued → running → succeeded) and then end the stream

### Requirement: Mock gRPC server implements Armada Jobs service
The mock server SHALL implement the Jobs query service from `pkg/api/job.proto`.

#### Scenario: GetJobStatus returns status map
- **WHEN** a client calls `GetJobStatus` with job IDs
- **THEN** the server SHALL return a map of job IDs to state strings (e.g., "RUNNING")

#### Scenario: GetJobDetails returns details map
- **WHEN** a client calls `GetJobDetails` with job IDs
- **THEN** the server SHALL return a map of job IDs to detail objects including job runs with cluster info

### Requirement: Mock gRPC server starts and stops quickly
The mock server SHALL start and stop within process lifecycle without external dependencies.

#### Scenario: Server starts in under 500ms
- **WHEN** the mock server is created and started
- **THEN** it SHALL be accepting connections within 500 milliseconds

#### Scenario: Server binds to dynamic port
- **WHEN** the mock server starts
- **THEN** it SHALL bind to port 0 (OS-assigned) and expose the actual port for client configuration

#### Scenario: Server shuts down cleanly
- **WHEN** `server.stop()` is called
- **THEN** all connections SHALL be closed and the port released
