import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { ResolvedConfig } from '../types/config';
import { ArmadaJobSpec, SubmitJobResponse, JobEventMessage } from '../types/armada';

export class ArmadaClient {
    private submitClient: any;
    private eventClient: any;
    private jobsClient: any;
    private binocularsClient: any; // Default Binoculars client (no cluster ID)
    private binocularsClients: Map<string, any> = new Map(); // Cluster-specific Binoculars clients
    private config: ResolvedConfig;
    private initialized: boolean = false;

    constructor(config: ResolvedConfig) {
        this.config = config;
    }

    /**
     * Get or create a Binoculars client for a specific cluster
     */
    private getBinocularsClientForCluster(clusterId: string): any {
        // Check if we have a cached client for this cluster
        if (this.binocularsClients.has(clusterId)) {
            return this.binocularsClients.get(clusterId);
        }

        // Create a new client for this cluster
        let binocularsUrl: string | null = null;

        // Priority 1: Use pattern if available
        if (this.config.binocularsUrlPattern) {
            binocularsUrl = this.config.binocularsUrlPattern.replace('{CLUSTER_ID}', clusterId);
            console.log(`[Armada] Using binocularsUrlPattern for cluster "${clusterId}":`, binocularsUrl);
        }
        // Priority 2: Use explicit URL
        else if (this.config.binocularsUrl) {
            binocularsUrl = this.config.binocularsUrl;
            console.log(`[Armada] Using explicit binocularsUrl for cluster "${clusterId}":`, binocularsUrl);
        }
        // Priority 3: Auto-derive from Armada URL
        else {
            binocularsUrl = this.deriveBinocularsUrl(this.config.armadaUrl);
            if (binocularsUrl) {
                console.log(`[Armada] Auto-derived binocularsUrl for cluster "${clusterId}":`, binocularsUrl);
            }
        }

        if (!binocularsUrl) {
            console.error(`[Armada] Could not determine Binoculars URL for cluster "${clusterId}"`);
            return null;
        }

        // Load and create the client
        const credentials = grpc.credentials.createInsecure();
        const protoRoot = path.join(__dirname, '..', 'proto');
        const protoOptions = {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
            includeDirs: [protoRoot]
        };

        const binocularsProtoPath = path.join(protoRoot, 'pkg', 'api', 'binoculars', 'binoculars.proto');
        const binocularsPackageDefinition = protoLoader.loadSync(binocularsProtoPath, protoOptions);
        const binocularsProto = grpc.loadPackageDefinition(binocularsPackageDefinition) as any;
        const client = new binocularsProto.binoculars.Binoculars(
            binocularsUrl,
            credentials
        );

        // Cache the client
        this.binocularsClients.set(clusterId, client);
        console.log(`[Armada] Created and cached Binoculars client for cluster "${clusterId}"`);

        return client;
    }

    /**
     * Derive Binoculars URL from Armada URL
     * Pattern: If Armada is on port X, Binoculars gRPC is typically on port X+2
     * Examples:
     *   localhost:30002 -> localhost:30004
     *   armada.example.com:50051 -> armada.example.com:50053
     */
    private deriveBinocularsUrl(armadaUrl: string): string | null {
        try {
            // Parse the URL
            const urlMatch = armadaUrl.match(/^(?:https?:\/\/)?([^:]+)(?::(\d+))?$/);
            if (!urlMatch) {
                console.log('[Armada] Could not parse Armada URL for Binoculars derivation:', armadaUrl);
                return null;
            }

            const host = urlMatch[1];
            const port = urlMatch[2] ? parseInt(urlMatch[2]) : null;

            if (!port) {
                console.log('[Armada] Armada URL has no port, cannot derive Binoculars URL');
                return null;
            }

            // Binoculars gRPC port is typically Armada gRPC port + 2
            const binocularsPort = port + 2;
            const binocularsUrl = `${host}:${binocularsPort}`;

            console.log('[Armada] Derived Binoculars URL:', binocularsUrl);
            return binocularsUrl;
        } catch (error) {
            console.error('[Armada] Error deriving Binoculars URL:', error);
            return null;
        }
    }

    private initializeClients(): void {
        if (this.initialized) {
            return;
        }

        const credentials = grpc.credentials.createInsecure(); // TODO: Add TLS support

        // Set up proto include paths
        const protoRoot = path.join(__dirname, '..', 'proto');
        const protoOptions = {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
            includeDirs: [protoRoot]
        };

        // Load Submit service
        const submitProtoPath = path.join(protoRoot, 'pkg', 'api', 'submit.proto');
        const submitPackageDefinition = protoLoader.loadSync(submitProtoPath, protoOptions);
        const submitProto = grpc.loadPackageDefinition(submitPackageDefinition) as any;
        this.submitClient = new submitProto.api.Submit(
            this.config.armadaUrl,
            credentials
        );

        // Load Event service
        const eventProtoPath = path.join(protoRoot, 'pkg', 'api', 'event.proto');
        const eventPackageDefinition = protoLoader.loadSync(eventProtoPath, protoOptions);
        const eventProto = grpc.loadPackageDefinition(eventPackageDefinition) as any;
        this.eventClient = new eventProto.api.Event(
            this.config.armadaUrl,
            credentials
        );

        // Load Jobs service (Query API)
        const jobProtoPath = path.join(protoRoot, 'pkg', 'api', 'job.proto');
        const jobPackageDefinition = protoLoader.loadSync(jobProtoPath, protoOptions);
        const jobProto = grpc.loadPackageDefinition(jobPackageDefinition) as any;
        this.jobsClient = new jobProto.api.Jobs(
            this.config.armadaUrl,
            credentials
        );

        // Load Binoculars service (for logs)
        // Binoculars runs on a separate port/service from the main Armada server
        // Auto-derive Binoculars URL if not explicitly configured
        const binocularsUrl = this.config.binocularsUrl || this.deriveBinocularsUrl(this.config.armadaUrl);

        if (binocularsUrl) {
            const binocularsProtoPath = path.join(protoRoot, 'pkg', 'api', 'binoculars', 'binoculars.proto');
            const binocularsPackageDefinition = protoLoader.loadSync(binocularsProtoPath, protoOptions);
            const binocularsProto = grpc.loadPackageDefinition(binocularsPackageDefinition) as any;
            this.binocularsClient = new binocularsProto.binoculars.Binoculars(
                binocularsUrl,
                credentials
            );
            console.log('[Armada] Binoculars client initialized at:', binocularsUrl);
            if (!this.config.binocularsUrl) {
                console.log('[Armada] Binoculars URL auto-derived from Armada URL');
            }
        } else {
            console.log('[Armada] Could not derive Binoculars URL - log viewing will be unavailable');
        }

        this.initialized = true;
    }

    /**
     * Submit jobs to Armada
     */
    async submitJobs(jobSpec: ArmadaJobSpec): Promise<SubmitJobResponse> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const jobRequestItems = jobSpec.jobs.map(job => this.convertJobToProto(job));

            // Debug logging
            console.log('[Armada] Submitting jobs:', JSON.stringify({
                queue: jobSpec.queue,
                jobSetId: jobSpec.jobSetId,
                jobCount: jobRequestItems.length,
                firstJob: jobRequestItems[0]
            }, null, 2));

            const request = {
                queue: jobSpec.queue,
                job_set_id: jobSpec.jobSetId,
                job_request_items: jobRequestItems
            };

            this.submitClient.SubmitJobs(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] Submit error:', error);
                    reject(new Error(`Failed to submit jobs: ${error.message}`));
                    return;
                }

                console.log('[Armada] Submit successful:', response);
                resolve({
                    jobIds: response.job_response_items || []
                });
            });
        });
    }

    /**
     * Cancel a job
     */
    async cancelJob(jobId: string, jobSetId: string, queue: string): Promise<void> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                job_id: jobId,
                job_set_id: jobSetId,
                queue: queue
            };

            this.submitClient.CancelJobs(request, (error: any, response: any) => {
                if (error) {
                    reject(new Error(`Failed to cancel job: ${error.message}`));
                    return;
                }

                resolve();
            });
        });
    }

    /**
     * Get queue information
     */
    async getQueue(queueName: string): Promise<any> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                name: queueName
            };

            this.submitClient.GetQueue(request, (error: any, response: any) => {
                if (error) {
                    reject(new Error(`Failed to get queue: ${error.message}`));
                    return;
                }

                resolve(response);
            });
        });
    }

    /**
     * Get all queues
     */
    async getAllQueues(): Promise<any[]> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const queues: any[] = [];
            const request = {
                num: 1000 // Get up to 1000 queues
            };

            const stream = this.submitClient.GetQueues(request);

            stream.on('data', (message: any) => {
                if (message.queue) {
                    queues.push(message.queue);
                }
            });

            stream.on('error', (error: any) => {
                reject(new Error(`Failed to get queues: ${error.message}`));
            });

            stream.on('end', () => {
                console.log('[Armada] Retrieved', queues.length, 'queues');
                resolve(queues);
            });
        });
    }

    /**
     * Create a new queue
     */
    async createQueue(queue: any): Promise<void> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            this.submitClient.CreateQueue(queue, (error: any, response: any) => {
                if (error) {
                    reject(new Error(`Failed to create queue: ${error.message}`));
                    return;
                }

                console.log('[Armada] Queue created successfully:', queue.name);
                resolve();
            });
        });
    }

    /**
     * Stream job events for a job set
     */
    streamJobSetEvents(
        queue: string,
        jobSetId: string,
        onEvent: (event: JobEventMessage) => void,
        onError: (error: Error) => void
    ): () => void {
        this.initializeClients();
        const request = {
            id: jobSetId,  // Note: proto field is 'id' not 'job_set_id'
            queue: queue,
            watch: true,
            from_message_id: '',
            errorIfMissing: false
        };

        const stream = this.eventClient.GetJobSetEvents(request);

        stream.on('data', (message: any) => {
            console.log('[Armada] Raw event stream message:', JSON.stringify(message, null, 2));

            // EventStreamMessage has: { id: string, message: EventMessage }
            // EventMessage is a oneof with fields like submitted, queued, running, etc.
            if (message.message) {
                const eventMessage = message.message;
                console.log('[Armada] Event message:', JSON.stringify(eventMessage, null, 2));

                // Check which oneof field is set
                const convertedEvent = this.convertEventFromProto(eventMessage);
                if (convertedEvent) {
                    onEvent(convertedEvent);
                }
            }
        });

        stream.on('error', (error: any) => {
            console.error('[Armada] Event stream error:', error);
            onError(new Error(`Event stream error: ${error.message}`));
        });

        stream.on('end', () => {
            console.log('Event stream ended');
        });

        // Return a function to cancel the stream
        return () => {
            stream.cancel();
        };
    }

    /**
     * Convert job spec to protobuf format
     */
    private convertJobToProto(job: any): any {
        console.log('[Armada] Converting job to proto:', JSON.stringify(job, null, 2));

        // Convert podSpecs to Kubernetes PodSpec format
        const podSpecs = job.podSpecs ? job.podSpecs.map((spec: any) => {
            console.log('[Armada] Processing podSpec:', JSON.stringify(spec, null, 2));

            // Convert containers with proper resource format
            const containers = (spec.containers || []).map((container: any) => {
                const convertedContainer: any = {
                    name: container.name,
                    image: container.image,
                    command: container.command,
                    args: container.args,
                    imagePullPolicy: container.imagePullPolicy
                };

                // Convert resources to Kubernetes Quantity format
                if (container.resources) {
                    convertedContainer.resources = {};

                    if (container.resources.limits) {
                        convertedContainer.resources.limits = {};
                        for (const [key, value] of Object.entries(container.resources.limits)) {
                            convertedContainer.resources.limits[key] = { string: String(value) };
                        }
                    }

                    if (container.resources.requests) {
                        convertedContainer.resources.requests = {};
                        for (const [key, value] of Object.entries(container.resources.requests)) {
                            convertedContainer.resources.requests[key] = { string: String(value) };
                        }
                    }
                }

                // Add other optional container fields
                if (container.env) convertedContainer.env = container.env;
                if (container.volumeMounts) convertedContainer.volumeMounts = container.volumeMounts;
                if (container.ports) convertedContainer.ports = container.ports;
                if (container.securityContext) convertedContainer.securityContext = container.securityContext;

                return convertedContainer;
            });

            const podSpec: any = {
                containers: containers,
                restartPolicy: spec.restartPolicy || 'Never'
            };

            // Add optional fields if present
            if (spec.terminationGracePeriodSeconds !== undefined) {
                podSpec.terminationGracePeriodSeconds = spec.terminationGracePeriodSeconds;
            }
            if (spec.activeDeadlineSeconds !== undefined) {
                podSpec.activeDeadlineSeconds = spec.activeDeadlineSeconds;
            }
            if (spec.nodeSelector) {
                podSpec.nodeSelector = spec.nodeSelector;
            }
            if (spec.tolerations) {
                podSpec.tolerations = spec.tolerations;
            }
            if (spec.affinity) {
                podSpec.affinity = spec.affinity;
            }
            if (spec.volumes) {
                podSpec.volumes = spec.volumes;
            }
            if (spec.imagePullSecrets) {
                podSpec.imagePullSecrets = spec.imagePullSecrets;
            }

            console.log('[Armada] Converted podSpec:', JSON.stringify(podSpec, null, 2));
            return podSpec;
        }) : [];

        const result = {
            priority: job.priority || 0,
            namespace: job.namespace || 'default',
            client_id: job.clientId || '',
            labels: job.labels || {},
            annotations: job.annotations || {},
            pod_specs: podSpecs
        };

        console.log('[Armada] Final proto job:', JSON.stringify(result, null, 2));
        return result;
    }

    /**
     * Convert event from protobuf format
     */
    private convertEventFromProto(event: any): JobEventMessage | null {
        // EventMessage is a oneof - check which field is set
        let eventType = 'unknown';
        let eventData: any = null;

        if (event.submitted) {
            eventType = 'submitted';
            eventData = event.submitted;
        } else if (event.queued) {
            eventType = 'queued';
            eventData = event.queued;
        } else if (event.leased) {
            eventType = 'leased';
            eventData = event.leased;
        } else if (event.pending) {
            eventType = 'pending';
            eventData = event.pending;
        } else if (event.running) {
            eventType = 'running';
            eventData = event.running;
        } else if (event.succeeded) {
            eventType = 'succeeded';
            eventData = event.succeeded;
        } else if (event.failed) {
            eventType = 'failed';
            eventData = event.failed;
        } else if (event.cancelled) {
            eventType = 'cancelled';
            eventData = event.cancelled;
        } else if (event.preempted) {
            eventType = 'preempted';
            eventData = event.preempted;
        } else {
            console.log('[Armada] Unknown event type in:', JSON.stringify(event, null, 2));
            return null;
        }

        // Extract common fields from the specific event data
        return {
            jobId: eventData.job_id,
            jobSetId: eventData.job_set_id,
            queue: eventData.queue,
            created: eventData.created,
            event: {
                type: eventType,
                ...eventData
            }
        };
    }

    /**
     * Get job status using Jobs service (Query API)
     * This is an alternative to event streaming for getting current job states
     */
    async getJobStatus(jobIds: string[]): Promise<Map<string, string>> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                job_ids: jobIds
            };

            this.jobsClient.GetJobStatus(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] GetJobStatus error:', error);
                    reject(new Error(`Failed to get job status: ${error.message}`));
                    return;
                }

                console.log('[Armada] GetJobStatus response:', response);

                // Convert the response map to a JavaScript Map
                const statusMap = new Map<string, string>();
                if (response.job_states) {
                    for (const [jobId, state] of Object.entries(response.job_states)) {
                        statusMap.set(jobId, state as string);
                    }
                }

                resolve(statusMap);
            });
        });
    }

    /**
     * Get detailed job information using Jobs service (Query API)
     * Optionally expand job spec and run history
     */
    async getJobDetails(
        jobIds: string[],
        expandJobSpec: boolean = false,
        expandJobRun: boolean = true
    ): Promise<Map<string, any>> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                job_ids: jobIds,
                expand_job_spec: expandJobSpec,
                expand_job_run: expandJobRun
            };

            this.jobsClient.GetJobDetails(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] GetJobDetails error:', error);
                    reject(new Error(`Failed to get job details: ${error.message}`));
                    return;
                }

                console.log('[Armada] GetJobDetails response:', response);

                // Convert the response map to a JavaScript Map
                const detailsMap = new Map<string, any>();
                if (response.job_details) {
                    for (const [jobId, details] of Object.entries(response.job_details)) {
                        detailsMap.set(jobId, details);
                    }
                }

                resolve(detailsMap);
            });
        });
    }

    /**
     * Get job errors using Jobs service (Query API)
     */
    async getJobErrors(jobIds: string[]): Promise<Map<string, string>> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                job_ids: jobIds
            };

            this.jobsClient.GetJobErrors(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] GetJobErrors error:', error);
                    reject(new Error(`Failed to get job errors: ${error.message}`));
                    return;
                }

                console.log('[Armada] GetJobErrors response:', response);

                // Convert the response map to a JavaScript Map
                const errorsMap = new Map<string, string>();
                if (response.job_errors) {
                    for (const [jobId, errorMsg] of Object.entries(response.job_errors)) {
                        errorsMap.set(jobId, errorMsg as string);
                    }
                }

                resolve(errorsMap);
            });
        });
    }

    /**
     * Get active queues from Jobs service (Query API)
     */
    async getActiveQueues(): Promise<Map<string, string[]>> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {};

            this.jobsClient.GetActiveQueues(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] GetActiveQueues error:', error);
                    reject(new Error(`Failed to get active queues: ${error.message}`));
                    return;
                }

                console.log('[Armada] GetActiveQueues response:', response);

                // Convert the response to a Map of pool -> queue names
                const queuesMap = new Map<string, string[]>();
                if (response.active_queues_by_pool) {
                    for (const [pool, activeQueues] of Object.entries(response.active_queues_by_pool)) {
                        const queueList = (activeQueues as any).queues || [];
                        queuesMap.set(pool, queueList);
                    }
                }

                resolve(queuesMap);
            });
        });
    }

    /**
     * Get logs for a job using Binoculars service
     */
    async getJobLogs(
        jobId: string,
        podNumber: number = 0,
        podNamespace?: string,
        sinceTime?: string,
        tailLines?: number
    ): Promise<Array<{ timestamp: string; line: string }>> {
        this.initializeClients();

        // First, get job details to extract the cluster ID
        let clusterId = 'default'; // Fallback to 'default' if no cluster info available
        try {
            const jobDetails = await this.getJobDetails([jobId], false, true);
            const details = jobDetails.get(jobId);

            if (details && details.job_runs && details.job_runs.length > 0) {
                // Use the cluster from the latest run
                const latestRun = details.job_runs[details.job_runs.length - 1];
                if (latestRun.cluster) {
                    clusterId = latestRun.cluster;
                    console.log(`[Armada] Fetching logs from cluster "${clusterId}" for job ${jobId}`);
                }
            }
        } catch (error) {
            console.warn('[Armada] Could not fetch job details to determine cluster, using default:', error);
        }

        // Get the appropriate Binoculars client for this cluster
        const binocularsClient = this.getBinocularsClientForCluster(clusterId);

        if (!binocularsClient) {
            throw new Error(`Could not create Binoculars client for cluster "${clusterId}". Check your configuration.`);
        }

        return new Promise((resolve, reject) => {
            const request: any = {
                job_id: jobId,
                pod_number: podNumber
            };

            if (podNamespace) {
                request.pod_namespace = podNamespace;
            }

            if (sinceTime) {
                request.since_time = sinceTime;
            }

            if (tailLines !== undefined) {
                request.log_options = {
                    tail_lines: tailLines
                };
            }

            binocularsClient.Logs(request, (error: any, response: any) => {
                if (error) {
                    console.error('[Armada] GetLogs error:', error);
                    reject(new Error(`Failed to get logs: ${error.message}`));
                    return;
                }

                console.log('[Armada] GetLogs response:', response);

                // Convert the response to a simple array
                const logs: Array<{ timestamp: string; line: string }> = [];
                if (response.log) {
                    for (const logLine of response.log) {
                        logs.push({
                            timestamp: logLine.timestamp || '',
                            line: logLine.line || ''
                        });
                    }
                }

                resolve(logs);
            });
        });
    }

    /**
     * Note: Armada API does not provide a way to list all jobs in a queue.
     * Jobs can only be tracked via event streams for specific job sets.
     * Use streamJobSetEvents() to monitor jobs for a known queue/jobSetId pair.
     *
     * Alternatively, use the Jobs service methods (getJobStatus, getJobDetails)
     * if you already have job IDs.
     */

    /**
     * Test connection to Armada server
     */
    async testConnection(): Promise<boolean> {
        try {
            this.initializeClients();
            // Try to get a queue that likely doesn't exist - but should fail gracefully
            await this.getQueue('test-connection');
            return true;
        } catch (error) {
            // If we get a proper gRPC error, connection is working
            return true;
        }
    }
}
