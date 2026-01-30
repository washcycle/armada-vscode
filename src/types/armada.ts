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

export interface JobInfo {
    jobId: string;
    jobSetId: string;
    queue: string;
    state: JobState;
    created?: Date;
    priority?: number;
    namespace?: string;
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
 * gRPC response types
 */

export interface SubmitJobResponse {
    jobIds: string[];
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
