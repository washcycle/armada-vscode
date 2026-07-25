/**
 * Armada job specification types
 */

export interface ArmadaJobSpec {
    queue: string;
    jobSetId: string;
    jobs: JobSubmitRequest[];
}

export interface JobSubmitRequest {
    priority?: number;
    namespace?: string;
    clientId?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    requiredNodeLabels?: Record<string, string>;
    scheduler?: string;
    podSpecs?: any[]; // K8s pod spec - complex type
    ingress?: IngressConfig[];
    services?: ServiceConfig[];
}

export interface IngressConfig {
    type: string;
    ports: number[];
}

export interface ServiceConfig {
    name: string;
    ports: PortConfig[];
}

export interface PortConfig {
    port: number;
    protocol?: string;
    name?: string;
}

/**
 * Job status and event types
 */

export enum JobState {
    QUEUED = 'QUEUED',
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
    PREEMPTED = 'PREEMPTED'
}

export type FailureCategory = 'OOM' | 'Evicted' | 'ImagePull' | 'Preempted' | 'Rejected' | 'UserError';

export interface JobInfo {
    jobId: string;
    jobSetId: string;
    queue: string;
    state: JobState;
    created?: Date;
    stateEnteredAt?: Date;
    priority?: number;
    namespace?: string;
    failureReason?: string;
    failureCategory?: FailureCategory;
}

export interface JobSetInfo {
    jobSetId: string;
    queue: string;
    jobCount: number;
    jobs: JobInfo[];
}

export interface QueueInfo {
    name: string;
    priorityFactor: number;
    resourceLimits?: Record<string, string>;
}

export interface Queue {
    name: string;
    priority_factor: number;
    user_owners?: string[];
    group_owners?: string[];
    resource_limits_by_priority_class_name?: Record<string, any>;
    permissions?: any[];
    cordoned?: boolean;
    labels?: Record<string, string>;
}

/**
 * Connection state and diagnostics
 */

export type ConnectionState = 'unknown' | 'connected' | 'error' | 'auth-error';

export interface ConnectionTestResult {
    ok: boolean;
    detail?: string;   // present when ok === true
    code?: number;     // gRPC status code, present when ok === false
    message?: string;  // human-readable error, present when ok === false
}

/**
 * gRPC response types
 */

/** A job the server refused, with its reason. */
export interface RejectedJob {
    /** Index of the job in the submitted file, for pointing the user at it. */
    index: number;
    error: string;
}

export interface SubmitJobResponse {
    /** Ids of the jobs the server accepted. */
    jobIds: string[];
    /**
     * Jobs the server rejected individually.
     *
     * SubmitJobs can accept some items and reject others, reporting the reason
     * per item rather than as a call-level error. These used to be ignored, so a
     * rejected job was counted as a success and pushed into the tree as the
     * string "[object Object]".
     */
    rejected: RejectedJob[];
}

export interface JobEventMessage {
    jobId: string;
    jobSetId: string;
    queue: string;
    created: string;
    event: {
        type: string;
        [key: string]: any;
    };
}
