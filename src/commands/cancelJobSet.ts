import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';

export async function cancelJobSetCommand(
    client: ArmadaClient | undefined,
    item: any
): Promise<void> {
    if (!client) {
        vscode.window.showErrorMessage('Armada client not initialized. Please check your configuration.');
        return;
    }

    if (!item || !item.queue || !item.jobSetId) {
        vscode.window.showErrorMessage('Please select a job set from the tree view.');
        return;
    }

    const queue = item.queue as string;
    const jobSetId = item.jobSetId as string;
    const jobCount = item.jobs?.length ?? 0;

    const confirmation = await vscode.window.showWarningMessage(
        `Cancel all ${jobCount} job${jobCount !== 1 ? 's' : ''} in job set "${jobSetId}"?`,
        { modal: true },
        'Cancel Job Set'
    );

    if (confirmation !== 'Cancel Job Set') {
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Cancelling job set "${jobSetId}"...`,
                cancellable: false
            },
            async () => {
                await client.cancelJobSet(queue, jobSetId);
            }
        );

        vscode.window.showInformationMessage(`Job set "${jobSetId}" cancelled successfully.`);
    } catch (error: any) {
        const message = error.message ?? String(error);
        if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('unauthorized')) {
            vscode.window.showErrorMessage(`Permission denied: you do not have permission to cancel job set "${jobSetId}".`);
        } else {
            vscode.window.showErrorMessage(`Failed to cancel job set: ${message}`);
        }
    }
}
