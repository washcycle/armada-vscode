import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobTreeProvider } from '../providers/jobTreeProvider';
import { LookoutClient } from '../api/lookoutClient';
import { JobState } from '../types/armada';

export async function browseJobSetsCommand(
    client: ArmadaClient | undefined,
    jobTreeProvider: JobTreeProvider
): Promise<void> {
    if (!client) {
        vscode.window.showErrorMessage('Armada client not initialized. Please check your configuration.');
        return;
    }

    try {
        // TODO: Get Lookout URL from config (for now, use localhost:30000)
        const lookoutUrl = 'http://localhost:30000';
        const lookoutClient = new LookoutClient({ lookoutUrl });

        // Step 1: Select a queue
        const activeQueuesMap = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading active queues...',
                cancellable: false
            },
            async () => {
                return await client.getActiveQueues();
            }
        );

        const queueItems: Array<{ label: string; description: string; queue: string }> = [];
        for (const [pool, queues] of activeQueuesMap.entries()) {
            for (const queueName of queues) {
                queueItems.push({
                    label: queueName,
                    description: `Pool: ${pool}`,
                    queue: queueName
                });
            }
        }

        if (queueItems.length === 0) {
            vscode.window.showInformationMessage('No active queues found.');
            return;
        }

        const selectedQueue = await vscode.window.showQuickPick(queueItems, {
            placeHolder: 'Select a queue to browse job sets',
            matchOnDescription: true
        });

        if (!selectedQueue) {
            return; // User cancelled
        }

        // Step 2: Get job sets in this queue
        const jobSets = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading job sets in queue "${selectedQueue.queue}"...`,
                cancellable: false
            },
            async () => {
                return await lookoutClient.getJobSetsInQueue(selectedQueue.queue, 500);
            }
        );

        if (jobSets.length === 0) {
            vscode.window.showInformationMessage(`No job sets found in queue "${selectedQueue.queue}".`);
            return;
        }

        // Step 3: Filter by state (optional)
        const stateFilter = await vscode.window.showQuickPick(
            [
                { label: 'All states', value: undefined },
                { label: 'Running', value: 'RUNNING' },
                { label: 'Succeeded', value: 'SUCCEEDED' },
                { label: 'Failed', value: 'FAILED' },
                { label: 'Cancelled', value: 'CANCELLED' },
                { label: 'Pending', value: 'PENDING' },
                { label: 'Queued', value: 'QUEUED' }
            ],
            {
                placeHolder: 'Filter by job state (optional)',
                ignoreFocusOut: true
            }
        );

        if (!stateFilter) {
            return; // User cancelled
        }

        // Step 4: Get jobs for each job set and show selection
        const jobSetItems = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading job set details...',
                cancellable: false
            },
            async () => {
                const items: Array<{ label: string; description: string; detail: string; jobSet: string; jobCount: number }> = [];

                for (const jobSetId of jobSets) {
                    // Get jobs in this job set
                    const jobs = await lookoutClient.searchJobs(
                        selectedQueue.queue,
                        jobSetId,
                        stateFilter.value,
                        100
                    );

                    if (jobs.length > 0) {
                        const stateCounts = new Map<string, number>();
                        for (const job of jobs) {
                            stateCounts.set(job.state, (stateCounts.get(job.state) || 0) + 1);
                        }

                        const statesSummary = Array.from(stateCounts.entries())
                            .map(([state, count]) => `${count} ${state}`)
                            .join(', ');

                        const latestSubmit = jobs[0]?.submitted;
                        const submitDate = latestSubmit ? new Date(latestSubmit).toLocaleString() : 'Unknown';

                        items.push({
                            label: jobSetId,
                            description: statesSummary,
                            detail: `Latest: ${submitDate} | ${jobs.length} job(s)`,
                            jobSet: jobSetId,
                            jobCount: jobs.length
                        });
                    }
                }

                return items.sort((a, b) => b.jobCount - a.jobCount); // Sort by job count
            }
        );

        if (jobSetItems.length === 0) {
            vscode.window.showInformationMessage(
                `No job sets with state "${stateFilter.label}" found in queue "${selectedQueue.queue}".`
            );
            return;
        }

        // Step 5: Select job set to monitor
        const selectedJobSet = await vscode.window.showQuickPick(jobSetItems, {
            placeHolder: `Select a job set to monitor (${jobSetItems.length} found)`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selectedJobSet) {
            return; // User cancelled
        }

        // Step 6: Load the selected job set with actual jobs
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading ${selectedJobSet.jobCount} job(s)...`,
                cancellable: false
            },
            async () => {
                // Get the full job list from Lookout
                const jobs = await lookoutClient.getJobsInJobSet(
                    selectedQueue.queue,
                    selectedJobSet.jobSet,
                    200
                );

                // Load the job set (creates the container)
                await jobTreeProvider.loadJobsFromQueue(selectedQueue.queue, selectedJobSet.jobSet);

                // Add each job to the tree
                for (const job of jobs) {
                    // Convert Lookout state string to JobState enum
                    let jobState = JobState.QUEUED; // Default
                    if (job.state in JobState) {
                        jobState = job.state as JobState;
                    }

                    jobTreeProvider.addJob({
                        jobId: job.jobId,
                        jobSetId: job.jobSet,
                        queue: job.queue,
                        state: jobState,
                        namespace: job.namespace,
                        created: job.submitted ? new Date(job.submitted) : undefined
                    });
                }
            }
        );

        vscode.window.showInformationMessage(
            `Loaded ${selectedJobSet.jobCount} job(s) in "${selectedJobSet.jobSet}"`
        );
    } catch (error: any) {
        console.error('[Armada] Failed to browse job sets:', error);
        vscode.window.showErrorMessage(`Failed to browse job sets: ${error.message}`);
    }
}
