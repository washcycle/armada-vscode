import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';

export async function cancelJobCommand(
    client: ArmadaClient | undefined,
    item: any
): Promise<void> {
    if (!client) {
        vscode.window.showErrorMessage('Armada is not configured.');
        return;
    }

    if (!item || !item.jobInfo) {
        vscode.window.showErrorMessage('No job selected.');
        return;
    }

    const jobInfo = item.jobInfo;

    // Confirm cancellation
    const confirmation = await vscode.window.showWarningMessage(
        `Cancel job ${jobInfo.jobId}?`,
        { modal: true },
        'Cancel Job'
    );

    if (confirmation !== 'Cancel Job') {
        return;
    }

    try {
        await client.cancelJob(jobInfo.jobId, jobInfo.jobSetId, jobInfo.queue);
        vscode.window.showInformationMessage(`Job ${jobInfo.jobId} cancelled successfully.`);

        // Refresh job view
        vscode.commands.executeCommand('armada.refreshJobs');

    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to cancel job: ${error.message}`
        );
    }
}
