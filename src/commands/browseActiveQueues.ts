import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function browseActiveQueuesCommand(
    client: ArmadaClient | undefined,
    jobTreeProvider: JobTreeProvider
): Promise<void> {
    if (!client) {
        vscode.window.showErrorMessage('Armada client not initialized. Please check your configuration.');
        return;
    }

    try {
        // Get active queues from the Jobs service
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

        if (activeQueuesMap.size === 0) {
            vscode.window.showInformationMessage('No active queues found.');
            return;
        }

        // Flatten the map into a list of queue names with their pool
        const queueItems: Array<{ label: string; description: string; queue: string; pool: string }> = [];
        for (const [pool, queues] of activeQueuesMap.entries()) {
            for (const queueName of queues) {
                queueItems.push({
                    label: queueName,
                    description: `Pool: ${pool}`,
                    queue: queueName,
                    pool: pool
                });
            }
        }

        if (queueItems.length === 0) {
            vscode.window.showInformationMessage('No active queues found.');
            return;
        }

        // Show quick pick for queue selection
        const selectedQueue = await vscode.window.showQuickPick(queueItems, {
            placeHolder: 'Select a queue with active jobs',
            matchOnDescription: true
        });

        if (!selectedQueue) {
            return; // User cancelled
        }

        // Ask for job set ID
        const jobSetId = await vscode.window.showInputBox({
            prompt: `Enter Job Set ID for queue "${selectedQueue.queue}"`,
            placeHolder: 'e.g., my-job-set-123',
            validateInput: (value) => {
                return value.trim() ? null : 'Job Set ID cannot be empty';
            }
        });

        if (!jobSetId) {
            return; // User cancelled
        }

        // Load the job set
        await jobTreeProvider.loadJobsFromQueue(selectedQueue.queue, jobSetId.trim());

        vscode.window.showInformationMessage(
            `Monitoring job set "${jobSetId}" in queue "${selectedQueue.queue}"`
        );
    } catch (error: any) {
        console.error('[Armada] Failed to browse active queues:', error);
        vscode.window.showErrorMessage(`Failed to browse queues: ${error.message}`);
    }
}
