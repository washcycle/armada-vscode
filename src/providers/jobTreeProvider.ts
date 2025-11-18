import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobInfo, JobState, JobEventMessage } from '../types/armada';

interface MonitoredJobSet {
    queue: string;
    jobSetId: string;
    addedAt: string;
}

export class JobTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private jobs: Map<string, JobSetItem> = new Map();
    private client: ArmadaClient | undefined;
    private eventStreamCancellers: Map<string, () => void> = new Map();
    private context: vscode.ExtensionContext | undefined;

    constructor(client: ArmadaClient | undefined, context?: vscode.ExtensionContext) {
        this.client = client;
        this.context = context;
        if (client) {
            this.startMonitoring();
        }
    }

    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    updateClient(client: ArmadaClient | undefined): void {
        // Cancel all existing streams
        this.eventStreamCancellers.forEach(cancel => cancel());
        this.eventStreamCancellers.clear();

        this.client = client;
        this.jobs.clear();

        if (client) {
            this.startMonitoring();
        }

        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!this.client) {
            return [];
        }

        if (!element) {
            // Root level - return job sets
            return Array.from(this.jobs.values());
        }

        if (element instanceof JobSetItem) {
            // Return jobs in this job set
            return element.jobs;
        }

        return [];
    }

    /**
     * Add a job to the tree
     */
    addJob(jobInfo: JobInfo): void {
        const key = `${jobInfo.queue}/${jobInfo.jobSetId}`;

        let jobSet = this.jobs.get(key);
        const isNewJobSet = !jobSet;

        if (!jobSet) {
            jobSet = new JobSetItem(
                jobInfo.queue,
                jobInfo.jobSetId,
                vscode.TreeItemCollapsibleState.Expanded
            );
            this.jobs.set(key, jobSet);

            // Start monitoring this job set
            this.monitorJobSet(jobInfo.queue, jobInfo.jobSetId);
        }

        // Check if job already exists
        const existingJob = jobSet.jobs.find(j => j.jobInfo.jobId === jobInfo.jobId);
        if (!existingJob) {
            jobSet.jobs.push(new JobItem(jobInfo));
            jobSet.updateJobCount();
        }

        // Save state if this is a new job set
        if (isNewJobSet) {
            this.saveMonitoredJobSets().catch(err =>
                console.error('[Armada] Failed to save monitored job sets:', err)
            );
        }

        this.refresh();
    }

    /**
     * Update job state
     */
    updateJobState(jobId: string, state: JobState): void {
        for (const jobSet of this.jobs.values()) {
            const job = jobSet.jobs.find(j => j.jobInfo.jobId === jobId);
            if (job) {
                job.jobInfo.state = state;
                job.updateDisplay();
                this.refresh();
                return;
            }
        }
    }

    /**
     * Save monitored job sets to workspace state
     */
    private async saveMonitoredJobSets(): Promise<void> {
        if (!this.context) {
            return;
        }

        const monitored: MonitoredJobSet[] = [];
        for (const [key, jobSet] of this.jobs) {
            monitored.push({
                queue: jobSet.queue,
                jobSetId: jobSet.jobSetId,
                addedAt: new Date().toISOString()
            });
        }

        await this.context.workspaceState.update('armada.monitoredJobSets', monitored);
        console.log('[Armada] Saved', monitored.length, 'monitored job sets to workspace state');
    }

    /**
     * Load monitored job sets from workspace state
     */
    async loadMonitoredJobSets(): Promise<void> {
        if (!this.context || !this.client) {
            return;
        }

        const monitored = this.context.workspaceState.get<MonitoredJobSet[]>('armada.monitoredJobSets', []);

        if (monitored.length === 0) {
            console.log('[Armada] No saved job sets to restore');
            return;
        }

        console.log('[Armada] Restoring', monitored.length, 'monitored job sets...');

        for (const jobSet of monitored) {
            try {
                await this.loadJobsFromQueue(jobSet.queue, jobSet.jobSetId);
            } catch (error) {
                console.error(`[Armada] Failed to restore ${jobSet.queue}/${jobSet.jobSetId}:`, error);
            }
        }
    }

    /**
     * Clear all monitored job sets
     */
    async clearMonitoredJobSets(): Promise<void> {
        // Cancel all event streams
        this.eventStreamCancellers.forEach(cancel => cancel());
        this.eventStreamCancellers.clear();

        // Clear the job tree
        this.jobs.clear();

        // Clear saved state
        if (this.context) {
            await this.context.workspaceState.update('armada.monitoredJobSets', []);
        }

        this.refresh();
        console.log('[Armada] Cleared all monitored job sets');
    }

    /**
     * Start monitoring job sets
     * Auto-loads previously monitored job sets from workspace state
     */
    private async startMonitoring(): Promise<void> {
        console.log('[Armada] Ready to monitor job sets. Loading saved job sets...');
        await this.loadMonitoredJobSets();
    }

    /**
     * Start monitoring a job set in a specific queue
     * Note: Armada API does not provide a way to list all jobs. We can only
     * monitor jobs for known queue/jobSetId combinations via event streams.
     */
    async loadJobsFromQueue(queue: string, jobSetId?: string): Promise<void> {
        if (!this.client) {
            return;
        }

        try {
            // If no job set ID provided, prompt user for it
            if (!jobSetId) {
                const input = await vscode.window.showInputBox({
                    prompt: `Enter Job Set ID for queue "${queue}"`,
                    placeHolder: 'e.g., my-job-set',
                    validateInput: (value) => {
                        return value.trim() ? null : 'Job Set ID cannot be empty';
                    }
                });

                if (!input) {
                    return; // User cancelled
                }

                jobSetId = input.trim();
            }

            console.log('[Armada] Starting to monitor job set:', queue, '/', jobSetId);

            const key = `${queue}/${jobSetId}`;
            let jobSet = this.jobs.get(key);
            if (!jobSet) {
                jobSet = new JobSetItem(
                    queue,
                    jobSetId,
                    vscode.TreeItemCollapsibleState.Expanded
                );
                this.jobs.set(key, jobSet);
            }

            // Start monitoring this job set via event stream
            this.monitorJobSet(queue, jobSetId);

            // Save to workspace state
            await this.saveMonitoredJobSets();

            this.refresh();
        } catch (error: any) {
            console.error('[Armada] Failed to load job set:', error);
            throw error;
        }
    }

    /**
     * Refresh all currently loaded job sets by restarting their event streams
     */
    async refreshAllJobSets(): Promise<void> {
        if (!this.client) {
            return;
        }

        console.log('[Armada] Refreshing all job sets - restarting event streams');

        // Collect all job sets currently being tracked
        const jobSets: Array<{ queue: string; jobSetId: string }> = [];
        for (const [key, jobSet] of this.jobs) {
            jobSets.push({
                queue: jobSet.queue,
                jobSetId: jobSet.jobSetId
            });
        }

        // Cancel all existing event streams
        this.eventStreamCancellers.forEach(cancel => cancel());
        this.eventStreamCancellers.clear();

        // Restart event streams for all tracked job sets
        for (const { queue, jobSetId } of jobSets) {
            console.log('[Armada] Restarting event stream for:', `${queue}/${jobSetId}`);
            this.monitorJobSet(queue, jobSetId);
        }

        // Refresh the tree view
        this.refresh();
    }

    /**
     * Refresh job status using the Jobs service API (Query API)
     * This is an alternative to event streaming when events are not working
     */
    async refreshJobsUsingQueryAPI(): Promise<void> {
        if (!this.client) {
            return;
        }

        console.log('[Armada] Refreshing jobs using Query API');

        // Collect all job IDs we're currently tracking
        const jobIds: string[] = [];
        for (const jobSet of this.jobs.values()) {
            for (const job of jobSet.jobs) {
                jobIds.push(job.jobInfo.jobId);
            }
        }

        if (jobIds.length === 0) {
            console.log('[Armada] No jobs to refresh');
            return;
        }

        try {
            // Get job details for all tracked jobs
            const detailsMap = await this.client.getJobDetails(jobIds, false, true);

            console.log('[Armada] Retrieved details for', detailsMap.size, 'jobs');

            // Update each job's state based on the response
            for (const [jobId, details] of detailsMap.entries()) {
                const state = this.convertProtoState(details.state);
                this.updateJobState(jobId, state);
                console.log('[Armada] Updated job', jobId, 'to state', state);
            }

            // Also try to get error messages for failed jobs
            const failedJobIds = Array.from(detailsMap.entries())
                .filter(([_, details]) => details.state === 'JOB_STATE_FAILED')
                .map(([jobId, _]) => jobId);

            if (failedJobIds.length > 0) {
                try {
                    const errorsMap = await this.client.getJobErrors(failedJobIds);
                    for (const [jobId, error] of errorsMap.entries()) {
                        console.log('[Armada] Job', jobId, 'error:', error);
                        // Could store this error in JobInfo if we extend the type
                    }
                } catch (error: any) {
                    console.error('[Armada] Failed to get job errors:', error);
                }
            }

            this.refresh();
            vscode.window.showInformationMessage(`Refreshed ${detailsMap.size} job(s) using Query API`);
        } catch (error: any) {
            console.error('[Armada] Failed to refresh jobs using Query API:', error);
            vscode.window.showErrorMessage(`Failed to refresh jobs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Convert proto job state to JobState enum
     */
    private convertProtoState(protoState: any): JobState {
        // Map proto state values to our JobState enum
        // Proto states can come in different formats:
        // - String enum values: "QUEUED", "RUNNING", etc.
        // - Prefixed values: "JOB_STATE_QUEUED", "JOB_STATE_RUNNING", etc.
        // - Numeric values: 0, 1, 2, etc.
        if (typeof protoState === 'string') {
            const stateStr = protoState.toLowerCase();

            // Handle both "QUEUED" and "JOB_STATE_QUEUED" formats
            if (stateStr.includes('queued') || stateStr === 'submitted') {
                return JobState.QUEUED;
            } else if (stateStr.includes('pending') || stateStr.includes('leased')) {
                return JobState.PENDING;
            } else if (stateStr.includes('running')) {
                return JobState.RUNNING;
            } else if (stateStr.includes('succeeded')) {
                return JobState.SUCCEEDED;
            } else if (stateStr.includes('failed')) {
                return JobState.FAILED;
            } else if (stateStr.includes('cancelled')) {
                return JobState.CANCELLED;
            } else if (stateStr.includes('preempted')) {
                return JobState.PREEMPTED;
            }
        } else if (typeof protoState === 'number') {
            // Handle numeric enum values from proto
            // Based on JobState enum in submit.proto:
            // QUEUED=0, PENDING=1, RUNNING=2, SUCCEEDED=3, FAILED=4, UNKNOWN=5,
            // SUBMITTED=6, LEASED=7, PREEMPTED=8, CANCELLED=9, REJECTED=10
            switch (protoState) {
                case 0: case 6: return JobState.QUEUED; // QUEUED or SUBMITTED
                case 1: case 7: return JobState.PENDING; // PENDING or LEASED
                case 2: return JobState.RUNNING;
                case 3: return JobState.SUCCEEDED;
                case 4: return JobState.FAILED;
                case 8: return JobState.PREEMPTED;
                case 9: return JobState.CANCELLED;
                default: return JobState.QUEUED;
            }
        }
        return JobState.QUEUED;
    }

    /**
     * Monitor a specific job set for events
     */
    private monitorJobSet(queue: string, jobSetId: string): void {
        if (!this.client) {
            return;
        }

        const key = `${queue}/${jobSetId}`;
        console.log('[Armada] Starting to monitor job set:', key);

        // Cancel existing stream if any
        const existingCancel = this.eventStreamCancellers.get(key);
        if (existingCancel) {
            console.log('[Armada] Cancelling existing stream for:', key);
            existingCancel();
        }

        // Start new stream
        const cancel = this.client.streamJobSetEvents(
            queue,
            jobSetId,
            (event: JobEventMessage) => {
                console.log('[Armada] Received job event in provider:', JSON.stringify(event, null, 2));
                this.handleJobEvent(event);
            },
            (error: Error) => {
                console.error('[Armada] Event stream error for', key, ':', error);
            }
        );

        this.eventStreamCancellers.set(key, cancel);
        console.log('[Armada] Started event stream for:', key);
    }

    /**
     * Handle job events from the stream
     */
    private handleJobEvent(event: JobEventMessage): void {
        console.log('[Armada] Received job event:', event.event.type, 'for job', event.jobId);

        const eventType = event.event.type;
        let state: JobState;

        switch (eventType) {
            case 'submitted':
            case 'queued':
                state = JobState.QUEUED;
                break;
            case 'leased':
            case 'pending':
                state = JobState.PENDING;
                break;
            case 'running':
                state = JobState.RUNNING;
                break;
            case 'succeeded':
                state = JobState.SUCCEEDED;
                break;
            case 'failed':
                state = JobState.FAILED;
                break;
            case 'cancelled':
                state = JobState.CANCELLED;
                break;
            case 'preempted':
                state = JobState.PREEMPTED;
                break;
            default:
                console.log('[Armada] Unknown event type:', eventType);
                return;
        }

        console.log('[Armada] Updating job', event.jobId, 'to state', state);
        this.updateJobState(event.jobId, state);
    }
}

class JobSetItem extends vscode.TreeItem {
    jobs: JobItem[] = [];

    constructor(
        public readonly queue: string,
        public readonly jobSetId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(`${queue}/${jobSetId}`, collapsibleState);
        this.contextValue = 'jobset';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.updateJobCount();
    }

    updateJobCount(): void {
        this.description = `${this.jobs.length} job${this.jobs.length !== 1 ? 's' : ''}`;
    }
}

class JobItem extends vscode.TreeItem {
    constructor(public readonly jobInfo: JobInfo) {
        super(jobInfo.jobId, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'job';
        this.updateDisplay();
    }

    updateDisplay(): void {
        this.iconPath = this.getIconForState(this.jobInfo.state);
        this.description = this.jobInfo.state;
        this.tooltip = this.getTooltip();
    }

    private getIconForState(state: JobState): vscode.ThemeIcon {
        switch (state) {
            case JobState.QUEUED:
                return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
            case JobState.PENDING:
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
            case JobState.RUNNING:
                return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
            case JobState.SUCCEEDED:
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
            case JobState.FAILED:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case JobState.CANCELLED:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
            case JobState.PREEMPTED:
                return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    private getTooltip(): string {
        let tooltip = `Job ID: ${this.jobInfo.jobId}\n`;
        tooltip += `State: ${this.jobInfo.state}\n`;
        tooltip += `Queue: ${this.jobInfo.queue}\n`;
        tooltip += `Job Set: ${this.jobInfo.jobSetId}`;

        if (this.jobInfo.namespace) {
            tooltip += `\nNamespace: ${this.jobInfo.namespace}`;
        }

        if (this.jobInfo.created) {
            tooltip += `\nCreated: ${this.jobInfo.created.toLocaleString()}`;
        }

        return tooltip;
    }
}

type TreeItem = JobSetItem | JobItem;
