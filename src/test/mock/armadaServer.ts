import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as crypto from 'crypto';

// Proto root relative to compiled location: out/test/mock/ -> out/grpc/proto/
const PROTO_ROOT = path.resolve(__dirname, '../../grpc/proto');

const PROTO_OPTIONS: protoLoader.Options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT]
};

function loadProto(protoFile: string): grpc.GrpcObject {
    const def = protoLoader.loadSync(path.join(PROTO_ROOT, protoFile), PROTO_OPTIONS);
    return grpc.loadPackageDefinition(def);
}

export class MockArmadaServer {
    private server: grpc.Server;
    private port: number = 0;

    constructor() {
        this.server = new grpc.Server();
        this.registerServices();
    }

    private registerServices(): void {
        const submitProto = loadProto('pkg/api/submit.proto') as any;
        const eventProto = loadProto('pkg/api/event.proto') as any;
        const jobProto = loadProto('pkg/api/job.proto') as any;

        // Submit service
        this.server.addService(submitProto.api.Submit.service, {
            SubmitJobs: this.handleSubmitJobs.bind(this),
            CancelJobs: this.handleCancelJobs.bind(this),
            GetQueue: this.handleGetQueue.bind(this),
            GetQueues: this.handleGetQueues.bind(this),
            CreateQueue: this.handleCreateQueue.bind(this),
            UpdateQueue: (_call: any, cb: any) => cb(null, {}),
            DeleteQueue: (_call: any, cb: any) => cb(null, {}),
            CreateQueues: (_call: any, cb: any) => cb(null, { failed_queues: [] }),
            UpdateQueues: (_call: any, cb: any) => cb(null, { failed_queues: [] }),
            CancelJobSet: (_call: any, cb: any) => cb(null, {}),
            ReprioritizeJobs: (_call: any, cb: any) => cb(null, { reprioritization_results: {} }),
            PreemptJobs: (_call: any, cb: any) => cb(null, {}),
            Health: (_call: any, cb: any) => cb(null, { status: 'SERVING' }),
            CordonQueue: (_call: any, cb: any) => cb(null, {}),
            UncordonQueue: (_call: any, cb: any) => cb(null, {}),
            PreemptOnQueue: (_call: any, cb: any) => cb(null, {}),
            CancelOnQueue: (_call: any, cb: any) => cb(null, {})
        });

        // Event service
        this.server.addService(eventProto.api.Event.service, {
            GetJobSetEvents: this.handleGetJobSetEvents.bind(this),
            Watch: (call: any) => call.end()
        });

        // Jobs service
        this.server.addService(jobProto.api.Jobs.service, {
            GetJobStatus: this.handleGetJobStatus.bind(this),
            GetJobDetails: this.handleGetJobDetails.bind(this),
            GetJobErrors: this.handleGetJobErrors.bind(this),
            GetJobStatusUsingExternalJobUri: (_call: any, cb: any) => cb(null, { job_states: {} }),
            GetJobRunDetails: (_call: any, cb: any) => cb(null, { job_run_details: {} }),
            GetActiveQueues: (_call: any, cb: any) => cb(null, { active_queues_by_pool: {} })
        });
    }

    // Submit handlers
    private handleSubmitJobs(call: any, callback: any): void {
        const jobs: any[] = call.request.job_request_items || [];
        const items = jobs.map(() => ({
            job_id: crypto.randomUUID(),
            error: ''
        }));
        callback(null, { job_response_items: items });
    }

    private handleCancelJobs(_call: any, callback: any): void {
        callback(null, { cancelled_ids: [] });
    }

    private handleGetQueue(call: any, callback: any): void {
        callback(null, {
            name: call.request.name,
            priority_factor: 1,
            user_owners: [],
            group_owners: []
        });
    }

    private handleGetQueues(call: any): void {
        // Stream one queue then end
        call.write({
            queue: {
                name: 'default',
                priority_factor: 1,
                user_owners: [],
                group_owners: []
            }
        });
        call.end();
    }

    private handleCreateQueue(_call: any, callback: any): void {
        callback(null, {});
    }

    // Event handlers
    private handleGetJobSetEvents(call: any): void {
        const jobId = crypto.randomUUID();
        const queue = call.request.queue || 'test-queue';
        const jobSetId = call.request.id || 'test-job-set';

        const events = [
            { submitted: { job_id: jobId, job_set_id: jobSetId, queue } },
            { queued: { job_id: jobId, job_set_id: jobSetId, queue } },
            { running: { job_id: jobId, job_set_id: jobSetId, queue, cluster_id: 'test-cluster', kubernetes_id: 'k8s-id', pod_namespace: 'default', pod_name: 'pod-1' } },
            { succeeded: { job_id: jobId, job_set_id: jobSetId, queue, cluster_id: 'test-cluster', kubernetes_id: 'k8s-id', pod_namespace: 'default', pod_name: 'pod-1', pod_number: 0 } }
        ];

        events.forEach((event, i) => {
            call.write({ id: `msg-${i}`, message: event });
        });
        call.end();
    }

    // Jobs handlers
    private handleGetJobStatus(call: any, callback: any): void {
        const jobIds: string[] = call.request.job_ids || [];
        const jobStates: Record<string, string> = {};
        jobIds.forEach(id => { jobStates[id] = 'RUNNING'; });
        callback(null, { job_states: jobStates });
    }

    private handleGetJobDetails(call: any, callback: any): void {
        const jobIds: string[] = call.request.job_ids || [];
        const jobDetails: Record<string, any> = {};
        jobIds.forEach(id => {
            jobDetails[id] = {
                job_id: id,
                queue: 'test-queue',
                jobset: 'test-job-set',
                namespace: 'default',
                state: 'RUNNING',
                latest_run_id: 'run-1',
                job_runs: {
                    'run-1': {
                        run_id: 'run-1',
                        job_id: id,
                        state: 'RUN_STATE_RUNNING',
                        cluster: 'test-cluster'
                    }
                }
            };
        });
        callback(null, { job_details: jobDetails });
    }

    private handleGetJobErrors(call: any, callback: any): void {
        const jobIds: string[] = call.request.job_ids || [];
        const jobErrors: Record<string, string> = {};
        jobIds.forEach(id => { jobErrors[id] = ''; });
        callback(null, { job_errors: jobErrors });
    }

    /** Start the server on a dynamic port. Returns the assigned port. */
    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.bindAsync(
                '127.0.0.1:0',
                grpc.ServerCredentials.createInsecure(),
                (err, port) => {
                    if (err) { reject(err); return; }
                    this.port = port;
                    resolve(port);
                }
            );
        });
    }

    /** Stop the server and release the port. */
    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.tryShutdown(err => {
                if (err) { reject(err); } else { resolve(); }
            });
        });
    }

    getPort(): number {
        return this.port;
    }
}
