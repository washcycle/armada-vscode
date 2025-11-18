import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function browseQueuesCommand(
    client: ArmadaClient | undefined,
    jobTreeProvider: JobTreeProvider
): Promise<void> {
    if (!client) {
        vscode.window.showWarningMessage('Armada is not configured');
        return;
    }

    try {
        // Get all queues
        const queues = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading queues...',
                cancellable: false
            },
            async () => {
                return await client.getAllQueues();
            }
        );

        if (queues.length === 0) {
            vscode.window.showInformationMessage('No queues found');
            return;
        }

        // Create quick pick items
        const items = queues.map(queue => ({
            label: queue.name,
            description: `Priority: ${queue.priority_factor || 1}`,
            detail: queue.resource_limits ?
                `Resources: ${JSON.stringify(queue.resource_limits)}` :
                undefined,
            queue: queue
        }));

        // Show queue picker
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a queue to view jobs',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) {
            return;
        }

        // Load jobs from selected queue
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading jobs from queue "${selected.queue.name}"...`,
                cancellable: false
            },
            async () => {
                await jobTreeProvider.loadJobsFromQueue(selected.queue.name);
            }
        );

        vscode.window.showInformationMessage(
            `Loaded jobs from queue "${selected.queue.name}"`
        );

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to browse queues: ${error.message}`);
    }
}
