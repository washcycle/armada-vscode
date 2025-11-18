import * as https from 'https';
import * as http from 'http';

export interface LookoutConfig {
    lookoutUrl: string; // e.g., "http://localhost:30000"
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

    constructor(config: LookoutConfig) {
        this.lookoutUrl = config.lookoutUrl.replace(/\/$/, ''); // Remove trailing slash
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

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = client.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.code && parsed.message) {
                            reject(new Error(`Lookout API error: ${parsed.message}`));
                        } else {
                            resolve(parsed as T);
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`HTTP request failed: ${error.message}`));
            });

            req.write(JSON.stringify(body));
            req.end();
        });
    }
}
