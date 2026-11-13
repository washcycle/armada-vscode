import * as https from 'https';
import * as http from 'http';
import { describeCertificateError } from '../grpc/caCerts';

export interface LookoutConfig {
    lookoutUrl: string; // e.g., "https://lookout.armada.example.com"
    authHeader?: string; // Optional Bearer token or other auth header value
    /**
     * Extra CA certificates to trust, already merged with the system roots.
     * Needed when a corporate TLS proxy re-signs HTTPS traffic.
     */
    caCerts?: Buffer;
    /** The configured path, used only to make certificate errors actionable. */
    caCertPath?: string;
    /** Request timeout in milliseconds (default 30s). */
    timeoutMs?: number;
}

/** Default request timeout for Lookout calls. */
export const LOOKOUT_TIMEOUT_MS = 30_000;

function isLoopbackHost(host: string): boolean {
    const h = host.toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127(?:\.\d{1,3}){3}$/.test(h);
}

/**
 * Normalise a configured Lookout base URL: trim whitespace, drop trailing
 * slashes, and add a scheme when none was given (`http://` for localhost and
 * loopback addresses, `https://` otherwise). Without a scheme, `new URL()`
 * parses "localhost:30000" as protocol "localhost:" and the request silently
 * goes to port 80.
 */
export function normalizeLookoutUrl(raw: string): string {
    let url = (raw ?? '').trim().replace(/\/+$/, '');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        const host = url.split(/[/:?#]/)[0] || url;
        const bracketed = url.startsWith('[') ? url.slice(0, url.indexOf(']') + 1) : host;
        url = `${isLoopbackHost(bracketed) ? 'http' : 'https'}://${url}`;
    }
    return url;
}

export interface LookoutJob {
    jobId: string;
    jobSet: string;
    queue: string;
    state: string;
    owner: string;
    namespace: string;
    cluster: string;
    submitted: string;
    lastTransitionTime?: string;
    cancelled?: string;
    cancelUser?: string;
    runs?: Array<{
        runId: string;
        cluster: string;
        jobRunState: string;
        leased?: string;
        pending?: string;
        started?: string;
        finished?: string;
        node?: string;
        exitCode?: number;
    }>;
}

export interface LookoutJobsRequest {
    filters: Array<{
        field: string;
        value: any;
        match?: string; // "exact", "startsWith", "contains"
    }>;
    order: {
        field: string;
        direction: 'ASC' | 'DESC';
    };
    take: number;
    skip?: number;
}

export interface LookoutJobsResponse {
    jobs: LookoutJob[];
}

export class LookoutClient {
    private lookoutUrl: string;
    private authHeader?: string;
    private httpsAgent?: https.Agent;
    private caCertPath?: string;
    private timeoutMs: number;

    constructor(config: LookoutConfig) {
        this.lookoutUrl = normalizeLookoutUrl(config.lookoutUrl);
        this.authHeader = config.authHeader;
        this.timeoutMs = config.timeoutMs ?? LOOKOUT_TIMEOUT_MS;
        if (config.caCerts) {
            // `ca` replaces the default roots, so the caller passes a bundle
            // that already includes them.
            this.httpsAgent = new https.Agent({ ca: config.caCerts });
            // Only remembered when the bundle actually loaded: a path with no
            // certs behind it must not produce "your bundle is missing the
            // signing CA" advice about a file that was never read.
            this.caCertPath = config.caCertPath;
        }
    }

    /**
     * Get jobs from Lookout v2 API
     */
    async getJobs(request: LookoutJobsRequest): Promise<LookoutJob[]> {
        const url = `${this.lookoutUrl}/api/v1/jobs?backend=jsonb`;

        const response = await this.httpPost<LookoutJobsResponse>(url, request);
        return response.jobs || [];
    }

    /**
     * Get unique job sets from a queue
     */
    async getJobSetsInQueue(queue: string, limit: number = 100): Promise<string[]> {
        const jobs = await this.getJobs({
            filters: [
                {
                    field: 'queue',
                    value: queue,
                    match: 'exact'
                }
            ],
            order: {
                field: 'submitted',
                direction: 'DESC'
            },
            take: limit
        });

        // Extract unique job sets
        const jobSets = new Set<string>();
        for (const job of jobs) {
            jobSets.add(job.jobSet);
        }

        return Array.from(jobSets).sort();
    }

    /**
     * Get jobs in a specific job set
     */
    async getJobsInJobSet(queue: string, jobSetId: string, limit: number = 100): Promise<LookoutJob[]> {
        return await this.getJobs({
            filters: [
                {
                    field: 'queue',
                    value: queue,
                    match: 'exact'
                },
                {
                    field: 'jobSet',
                    value: jobSetId,
                    match: 'exact'
                }
            ],
            order: {
                field: 'submitted',
                direction: 'DESC'
            },
            take: limit
        });
    }

    /**
     * Search jobs with custom filters
     */
    async searchJobs(
        queue?: string,
        jobSet?: string,
        state?: string,
        limit: number = 100
    ): Promise<LookoutJob[]> {
        const filters: Array<{ field: string; value: any; match?: string }> = [];

        if (queue) {
            filters.push({ field: 'queue', value: queue, match: 'exact' });
        }
        if (jobSet) {
            filters.push({ field: 'jobSet', value: jobSet, match: 'exact' });
        }
        if (state) {
            filters.push({ field: 'state', value: state, match: 'exact' });
        }

        return await this.getJobs({
            filters,
            order: {
                field: 'submitted',
                direction: 'DESC'
            },
            take: limit
        });
    }

    /**
     * Make HTTP POST request
     */
    private httpPost<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (this.authHeader) {
                headers['Authorization'] = this.authHeader;
            }

            const options: https.RequestOptions = {
                // URL.hostname keeps IPv6 brackets ("[::1]"), which DNS lookup rejects.
                hostname: urlObj.hostname.replace(/^\[|\]$/g, ''),
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers
            };
            if (isHttps && this.httpsAgent) {
                options.agent = this.httpsAgent;
            }

            const req = client.request(options, (res) => {
                // Collect raw bytes and decode once: decoding per chunk corrupts
                // multi-byte UTF-8 characters split across chunk boundaries.
                const chunks: Buffer[] = [];

                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    const data = Buffer.concat(chunks).toString('utf8');
                    const status = res.statusCode ?? 0;

                    let parsed: any;
                    let parseError: unknown;
                    try {
                        parsed = JSON.parse(data);
                    } catch (error) {
                        parseError = error;
                    }

                    if (status < 200 || status >= 300) {
                        const serverMessage = parsed?.message
                            ?? data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
                        reject(new Error(
                            `Lookout returned HTTP ${status}${res.statusMessage ? ` ${res.statusMessage}` : ''} ` +
                            `from ${url}${serverMessage ? `: ${serverMessage}` : ''}`
                        ));
                        return;
                    }
                    if (parseError !== undefined) {
                        reject(new Error(`Failed to parse response: ${parseError}`));
                        return;
                    }
                    if (parsed.code && parsed.message) {
                        reject(new Error(`Lookout API error: ${parsed.message}`));
                        return;
                    }
                    resolve(parsed as T);
                });
            });

            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`Lookout did not respond within ${Math.round(this.timeoutMs / 1000)}s (${url})`));
            });

            req.on('error', (error) => {
                // Surface the CA-bundle remedy here too; a bare "HTTP request
                // failed: unable to verify the first certificate" gives the user
                // nothing to act on.
                const certHint = describeCertificateError(error.message, this.caCertPath);
                reject(new Error(`HTTP request failed: ${error.message}${certHint}`));
            });

            req.write(JSON.stringify(body));
            req.end();
        });
    }
}
