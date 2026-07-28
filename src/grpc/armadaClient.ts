import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as tls from 'tls';
import { ResolvedConfig } from '../types/config';
import { ArmadaJobSpec, SubmitJobResponse, JobEventMessage, Queue, ConnectionState, ConnectionTestResult, RejectedJob } from '../types/armada';
import * as protobuf from 'protobufjs';
import { buildAuthHeader, isSecureCredentials, makeAuthInterceptor, withCallCredentials } from './auth';
import { buildTrustStore, countCertificates, describeCertificateError, resolveCertPath } from './caCerts';
import { ConversionReport, convertJobItem } from './podSpecConverter';

/**
 * Strip any `http://` or `https://` scheme prefix from a URL so that the
 * result can be used as a bare `host:port` gRPC target string.
 */
export function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//, '');
}

/**
 * Whether a given endpoint will be dialed over TLS: an `https://` scheme or a
 * `:443` port, unless `forceNoTls` overrides it.
 *
 * Exposed separately from `selectCredentials` so callers can branch on the
 * transport without building (and, for TLS, loading root certs into) a
 * credentials object.
 */
export function usesTls(url: string, forceNoTls?: boolean): boolean {
    if (forceNoTls) {
        return false;
    }
    // Strip the scheme and path, then check whether the host:port portion ends with :443
    const hostPort = url.replace(/^https?:\/\//, '').split('/')[0];
    return url.startsWith('https://') || hostPort.endsWith(':443');
}

/**
 * Guess the Binoculars endpoint from the Armada endpoint.
 *
 * The `+2` offset comes from the quickstart's NodePort layout, where every
 * service gets its own port on a single host:
 *   localhost:30002            -> localhost:30004
 *   armada.example.com:50051   -> armada.example.com:50053
 *
 * That relationship does not exist behind a TLS reverse proxy or ingress, where
 * all services are fronted on 443 and separated by hostname instead. Deriving
 * there produces port 445 (SMB), and the log request fails with ECONNREFUSED —
 * which reads as "Binoculars is down" when in truth it was never configured.
 * The same applies to any explicit `https://` endpoint.
 *
 * Returns `{url: null, reason}` instead of guessing in those cases, so the
 * caller can tell the user which setting is missing.
 */
export function deriveBinocularsUrl(armadaUrl: string): { url: string | null; reason: string } {
    const urlMatch = armadaUrl.match(/^(?:(https?):\/\/)?([^:/]+)(?::(\d+))?$/);
    if (!urlMatch) {
        return { url: null, reason: `Could not parse the Armada URL "${armadaUrl}" to derive a Binoculars URL.` };
    }

    const [, scheme, host, portText] = urlMatch;
    const port = portText ? parseInt(portText, 10) : null;

    if (scheme === 'https' || port === 443) {
        return {
            url: null,
            reason: `Cannot infer a Binoculars URL from the TLS endpoint "${armadaUrl}", because ` +
                'services behind an ingress share one port and differ only by hostname. ' +
                'Set binocularsUrl (or binocularsUrlPattern for multi-cluster setups) in your ' +
                'armadactl config to view job logs.'
        };
    }

    if (!port) {
        return {
            url: null,
            reason: `The Armada URL "${armadaUrl}" has no port, so a Binoculars URL cannot be derived. ` +
                'Set binocularsUrl in your armadactl config to view job logs.'
        };
    }

    return { url: `${host}:${port + 2}`, reason: '' };
}

/**
 * Select gRPC channel credentials for a given endpoint URL.
 * Returns SSL credentials when the URL uses an `https://` scheme or targets
 * port 443.  Passing `forceNoTls: true` always returns insecure credentials
 * regardless of the URL (useful for development / plain-text servers).
 */
export function selectCredentials(
    url: string,
    forceNoTls?: boolean,
    rootCerts?: Buffer
): grpc.ChannelCredentials {
    return usesTls(url, forceNoTls)
        // A CA bundle replaces the default roots for this channel. Corporate
        // TLS-inspecting proxies re-sign traffic with a CA that is not in
        // Node's bundled root store, so without this the handshake fails.
        ? grpc.credentials.createSsl(rootCerts)
        : grpc.credentials.createInsecure();
}

/**
 * Message descriptors used to convert YAML into the exact shape the vendored
 * protos expect.
 *
 * @grpc/proto-loader exposes only serialize/deserialize for message types, not
 * the protobufjs `Type` needed to walk fields, so the descriptors are loaded
 * separately. Parsed once and cached: the k8s protos are large and the result is
 * immutable.
 */
let submitTypes: { podSpec: protobuf.Type; jobItem: protobuf.Type } | undefined;

export function getSubmitTypes(): { podSpec: protobuf.Type; jobItem: protobuf.Type } {
    if (submitTypes) {
        return submitTypes;
    }
    const protoRoot = path.join(__dirname, 'proto');
    const root = new protobuf.Root();
    // Resolve imports against the bundled proto tree, mirroring the
    // `includeDirs` given to proto-loader.
    root.resolvePath = (_origin, target) => path.resolve(protoRoot, target);
    // keepCase matches the proto-loader options, so field names stay as the
    // proto declares them (`priorityClassName`, not `priority_class_name`).
    root.loadSync('pkg/api/submit.proto', { keepCase: true });
    submitTypes = {
        podSpec: root.lookupType('k8s.io.api.core.v1.PodSpec'),
        jobItem: root.lookupType('api.JobSubmitRequestItem')
    };
    return submitTypes;
}

export class ArmadaClient {
    private submitClient: any;
    private eventClient: any;
    private jobsClient: any;
    private binocularsClient: any; // Default Binoculars client (no cluster ID)
    private binocularsClients: Map<string, any> = new Map(); // Cluster-specific Binoculars clients
    /** Why the Binoculars URL could not be determined, surfaced by getLogs. */
    private binocularsUrlError: string | undefined;
    private config: ResolvedConfig;
    private initialized: boolean = false;
    private cachedAuthHeader: string | undefined;
    private trustStore: Buffer | undefined;
    private trustStoreLoaded: boolean = false;

    connectionState: ConnectionState = 'unknown';
    onConnectionStateChange: ((state: ConnectionState, detail?: string) => void) | undefined;
    /** Optional sink so connection/auth failures reach the output channel. */
    onLogMessage: ((message: string) => void) | undefined;

    constructor(config: ResolvedConfig) {
        this.config = config;
    }

    private updateConnectionState(state: ConnectionState, detail?: string): void {
        if (state === this.connectionState) { return; }
        this.connectionState = state;
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(state, detail);
        }
    }

    private classifyGrpcError(error: any): void {
        const code: number | undefined = error?.code;
        // The server's own explanation is the most useful part of the error and
        // used to be dropped entirely, which made misconfigurations undebuggable.
        const details: string = error?.details || error?.message || '';
        const suffix = details ? ` Server said: ${details}` : '';

        if (code === 14) {
            // A certificate rejection arrives as UNAVAILABLE with the OpenSSL
            // reason buried in `details`, which reads like the server is down.
            // Corporate TLS proxies are the usual cause, so name the remedy.
            const certHint = describeCertificateError(details, this.activeCertPath());
            this.logError(`UNAVAILABLE from ${this.config.armadaUrl}.${suffix}${certHint}`);
            this.updateConnectionState(
                'error',
                certHint
                    ? `TLS certificate verification failed for ${this.config.armadaUrl}.${certHint}`
                    : `Cannot reach Armada server at ${this.config.armadaUrl}. Is armada-server running?`
            );
        } else if (code === 13) {
            this.logError(`INTERNAL error from ${this.config.armadaUrl}.${suffix}`);
            this.updateConnectionState('error', `Armada server returned an internal error.${suffix}`);
        } else if (code === 16 || code === 7) {
            const authType = this.config.auth?.type ?? 'none';
            const hint = authType === 'none'
                ? ' No credentials are configured for this context — add basicAuth or execAuth to your armadactl config.'
                : ` Credentials of type "${authType}" were sent but rejected.`;
            this.logError(`${code === 16 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED'} from ${this.config.armadaUrl}.${suffix}${hint}`);
            this.updateConnectionState('auth-error', `Authentication failed.${hint}${suffix}`);
        } else if (code !== undefined) {
            this.logError(`gRPC error code ${code} from ${this.config.armadaUrl}.${suffix}`);
        }
        // Application-level errors (5, 12, 2, etc.) do not change state
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
        const protoRoot = path.join(__dirname, 'proto');
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
            this.getCredentials(binocularsUrl),
            this.clientOptionsFor(binocularsUrl)
        );

        // Cache the client
        this.binocularsClients.set(clusterId, client);
        console.log(`[Armada] Created and cached Binoculars client for cluster "${clusterId}"`);

        return client;
    }

    /**
     * Derive a Binoculars URL from the Armada URL, logging the reason on failure.
     * See the module-level `deriveBinocularsUrl` for why derivation is not
     * always possible.
     */
    private deriveBinocularsUrl(armadaUrl: string): string | null {
        const derived = deriveBinocularsUrl(armadaUrl);
        if (derived.url === null) {
            // Kept so getLogs can report why, instead of blaming Binoculars.
            this.binocularsUrlError = derived.reason;
            this.logWarning(derived.reason);
            return null;
        }
        console.log('[Armada] Derived Binoculars URL:', derived.url);
        return derived.url;
    }

    /**
     * Determine gRPC channel credentials for a given URL.
     * Uses TLS when the URL has an `https://` scheme or targets port 443,
     * unless `forceNoTls` is set in the config.
     */
    private getCredentials(url: string): grpc.ChannelCredentials {
        const channelCredentials = selectCredentials(url, this.config.forceNoTls, this.getTrustStore());

        // Attach the credentials from the armadactl config to every call on
        // this channel. Without this the extension parses basicAuth/execAuth
        // and then never sends it, so any server with anonymousAuth disabled
        // answers 16 UNAUTHENTICATED.
        if (!this.hasAuth()) {
            return channelCredentials;
        }

        if (!isSecureCredentials(channelCredentials)) {
            // gRPC refuses call credentials on a plaintext channel
            // ("Cannot compose insecure credentials"), so these channels get
            // the header from the interceptor in clientOptionsFor() instead.
            this.logWarning(
                `Sending credentials over an unencrypted connection to ${url}. ` +
                'Credentials will be transmitted in plaintext.'
            );
            return channelCredentials;
        }

        return withCallCredentials(channelCredentials, () => this.getAuthHeader());
    }

    private hasAuth(): boolean {
        return !!this.config.auth && this.config.auth.type !== 'none';
    }

    /**
     * The CA bundle to trust, read once per client.
     *
     * A configured-but-unreadable bundle is reported and then ignored: failing
     * the whole client would leave the user with no UI at all, while continuing
     * with the default roots at least keeps publicly-signed endpoints working.
     * The message says which file to fix.
     */
    private getTrustStore(): Buffer | undefined {
        if (this.trustStoreLoaded) {
            return this.trustStore;
        }
        this.trustStoreLoaded = true;

        try {
            this.trustStore = buildTrustStore(this.config.caCertPath);
            if (this.trustStore && this.config.caCertPath) {
                const extra = countCertificates(this.trustStore) - tls.rootCertificates.length;
                this.logInfo(
                    `Trusting ${extra} extra CA certificate(s) from ` +
                    `${resolveCertPath(this.config.caCertPath)} in addition to the system roots.`
                );
            }
        } catch (error: any) {
            this.trustStore = undefined;
            this.logError(
                `${error.message} Falling back to the default certificate store, ` +
                'so connections through a TLS-inspecting proxy will likely fail.'
            );
        }

        return this.trustStore;
    }

    /**
     * The CA bundle path actually in effect, or undefined if none is.
     *
     * A configured-but-unloadable bundle is *not* in effect: telling the user
     * their bundle "did not contain the signing CA" would send them auditing a
     * file that was never read. The load failure is reported separately.
     */
    private activeCertPath(): string | undefined {
        return this.getTrustStore() ? this.config.caCertPath : undefined;
    }

    /**
     * Client options for a given endpoint.
     *
     * Secure channels carry the auth header via call credentials (see
     * `getCredentials`). Plaintext channels cannot — gRPC refuses to compose
     * call credentials with insecure channel credentials — so they get an
     * interceptor that sets the header on every outgoing call instead. Doing it
     * as an interceptor rather than per call site covers unary and streaming
     * methods alike.
     */
    private clientOptionsFor(url: string): grpc.ClientOptions {
        if (!this.needsAuthInterceptor(url)) {
            return {};
        }
        return {
            interceptors: [
                makeAuthInterceptor(
                    () => this.getAuthHeader(),
                    message => this.logError(message)
                )
            ]
        };
    }

    /**
     * True when auth is configured but the channel is plaintext, so the header
     * has to be injected per call rather than by the channel credentials.
     */
    private needsAuthInterceptor(url: string): boolean {
        return this.hasAuth() && !usesTls(url, this.config.forceNoTls);
    }

    /**
     * Resolve the `authorization` header value, caching it for basic auth
     * (which is static) while letting exec-based tokens be re-fetched.
     */
    private async getAuthHeader(): Promise<string | undefined> {
        if (this.config.auth?.type === 'basic') {
            if (this.cachedAuthHeader === undefined) {
                this.cachedAuthHeader = await buildAuthHeader(this.config.auth);
            }
            return this.cachedAuthHeader;
        }
        return buildAuthHeader(this.config.auth);
    }

    private logInfo(message: string): void {
        console.log(`[Armada] ${message}`);
        if (this.onLogMessage) {
            this.onLogMessage(message);
        }
    }

    private logWarning(message: string): void {
        console.warn(`[Armada] ${message}`);
        if (this.onLogMessage) {
            this.onLogMessage(`WARNING: ${message}`);
        }
    }

    private logError(message: string): void {
        console.error(`[Armada] ${message}`);
        if (this.onLogMessage) {
            this.onLogMessage(`ERROR: ${message}`);
        }
    }

    private initializeClients(): void {
        if (this.initialized) {
            return;
        }

        const credentials = this.getCredentials(this.config.armadaUrl);
        const clientOptions = this.clientOptionsFor(this.config.armadaUrl);
        const armadaTarget = stripScheme(this.config.armadaUrl);

        // Set up proto include paths
        const protoRoot = path.join(__dirname, 'proto');
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
            armadaTarget,
            credentials,
            clientOptions
        );

        // Load Event service
        const eventProtoPath = path.join(protoRoot, 'pkg', 'api', 'event.proto');
        const eventPackageDefinition = protoLoader.loadSync(eventProtoPath, protoOptions);
        const eventProto = grpc.loadPackageDefinition(eventPackageDefinition) as any;
        this.eventClient = new eventProto.api.Event(
            armadaTarget,
            credentials,
            clientOptions
        );

        // Load Jobs service (Query API)
        const jobProtoPath = path.join(protoRoot, 'pkg', 'api', 'job.proto');
        const jobPackageDefinition = protoLoader.loadSync(jobProtoPath, protoOptions);
        const jobProto = grpc.loadPackageDefinition(jobPackageDefinition) as any;
        this.jobsClient = new jobProto.api.Jobs(
            armadaTarget,
            credentials,
            clientOptions
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
                this.getCredentials(binocularsUrl),
                this.clientOptionsFor(binocularsUrl)
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
            const jobRequestItems = jobSpec.jobs.map((job, index) => this.convertJobToProto(job, index));

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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to submit jobs: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
                console.log('[Armada] Submit successful:', response);

                // The server reports per-item failures inside a successful call,
                // so a response is not proof every job was accepted.
                const items: any[] = response.job_response_items || [];
                const jobIds: string[] = [];
                const rejected: RejectedJob[] = [];

                items.forEach((item, index) => {
                    const error = typeof item?.error === 'string' ? item.error.trim() : '';
                    if (error) {
                        rejected.push({ index, error });
                        return;
                    }
                    const jobId = item?.job_id || item?.jobId;
                    if (jobId) {
                        jobIds.push(String(jobId));
                    } else {
                        // Neither an id nor a reason: still a failure, and
                        // reporting it beats inventing a job that does not exist.
                        rejected.push({ index, error: 'server returned no job id' });
                    }
                });

                for (const failure of rejected) {
                    this.logError(`Armada rejected jobs[${failure.index}]: ${failure.error}`);
                }

                resolve({ jobIds, rejected });
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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to cancel job: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
                resolve();
            });
        });
    }

    /**
     * Reprioritize one or more jobs
     */
    async reprioritizeJobs(queue: string, jobSetId: string, jobIds: string[], newPriority: number): Promise<Map<string, string>> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                queue: queue,
                job_set_id: jobSetId,
                job_ids: jobIds,
                new_priority: newPriority
            };

            this.submitClient.ReprioritizeJobs(request, (error: any, response: any) => {
                if (error) {
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to reprioritize jobs: ${error.message}`));
                    return;
                }
                this.updateConnectionState('connected');
                // reprioritization_results maps jobId -> error string (empty = success)
                const results = new Map<string, string>();
                if (response?.reprioritization_results) {
                    for (const [jobId, err] of Object.entries(response.reprioritization_results)) {
                        results.set(jobId, err as string);
                    }
                }
                resolve(results);
            });
        });
    }

    /**
     * Cancel all jobs in a job set
     */
    async cancelJobSet(queue: string, jobSetId: string): Promise<void> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            const request = {
                queue: queue,
                job_set_id: jobSetId
            };

            this.submitClient.CancelJobSet(request, (error: any, _response: any) => {
                if (error) {
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to cancel job set: ${error.message}`));
                    return;
                }
                this.updateConnectionState('connected');
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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to get queue: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
    async createQueue(queue: Queue): Promise<void> {
        this.initializeClients();
        return new Promise((resolve, reject) => {
            this.submitClient.CreateQueue(queue, (error: any, response: any) => {
                if (error) {
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to create queue: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
    private convertJobToProto(job: any, jobIndex = 0): any {
        const report: ConversionReport = { unknownFields: [] };
        const { podSpec, jobItem } = getSubmitTypes();

        // Walks the descriptor rather than an allowlist, and accepts both the
        // singular `podSpec:` and the plural `podSpecs:` forms. Reading only the
        // plural made most real job files — and this extension's own README
        // example — submit an empty pod_specs, which the server rejects with
        // "Job must contain at least one PodSpec".
        const result = convertJobItem(job, jobItem, podSpec, report, `jobs[${jobIndex}]`);

        // A typo'd or unsupported key would otherwise vanish without trace: the
        // job submits and then behaves differently than the file describes.
        if (report.unknownFields.length > 0) {
            this.logWarning(
                `Ignoring ${report.unknownFields.length} unrecognized field(s) in the job file: ` +
                `${report.unknownFields.join(', ')}. Check for typos — these are not sent to Armada.`
            );
        }

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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to get job status: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to get job details: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to get job errors: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
                    this.classifyGrpcError(error);
                    reject(new Error(`Failed to get active queues: ${error.message}`));
                    return;
                }

                this.updateConnectionState('connected');
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
            throw new Error(
                this.binocularsUrlError
                    ?? `Could not create Binoculars client for cluster "${clusterId}". Check your configuration.`
            );
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
     * Probe the Armada server and return a structured result.
     * Never throws — callers always get a ConnectionTestResult.
     */
    async testConnection(): Promise<ConnectionTestResult> {
        this.initializeClients();
        return new Promise((resolve) => {
            this.jobsClient.GetActiveQueues({}, (error: any, response: any) => {
                if (error) {
                    const code: number | undefined = error?.code;
                    this.classifyGrpcError(error);

                    const messageMap: Record<number, string> = {
                        13: `Internal server error. The server at ${this.config.armadaUrl} returned an unexpected error.`,
                        14: `Cannot reach Armada server at ${this.config.armadaUrl}. Is armada-server running?`,
                        16: 'Authentication failed. Check your credentials.',
                        7:  'Permission denied. Check your credentials and access rights.',
                    };

                    const message = code !== undefined && messageMap[code]
                        ? messageMap[code]
                        : `Unexpected error (code ${code ?? '?'}): ${error.message}`;

                    // Application-level errors mean transport is alive
                    const APPLICATION_LEVEL_CODES = new Set([2, 5, 12]);
                    if (code !== undefined && APPLICATION_LEVEL_CODES.has(code)) {
                        resolve({ ok: true, detail: 'Server reachable (no active queues data available)' });
                        return;
                    }

                    resolve({ ok: false, code, message });
                    return;
                }

                this.updateConnectionState('connected');
                const totalQueues = Array.from(
                    Object.values(response.active_queues_by_pool ?? {})
                ).reduce((sum: number, pool: any) => sum + (pool?.queues?.length ?? 0), 0);
                resolve({ ok: true, detail: `${totalQueues} active queue${totalQueues !== 1 ? 's' : ''} found` });
            });
        });
    }
}
