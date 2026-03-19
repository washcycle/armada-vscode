import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobState } from '../types/armada';

export async function reprioritizeJobCommand(
    client: ArmadaClient | undefined,
    item: any
): Promise<void> {
    if (!client) {
        vscode.window.showErrorMessage('Armada client not initialized. Please check your configuration.');
        return;
    }

    if (!item || !item.jobInfo) {
        vscode.window.showErrorMessage('Please select a job from the tree view.');
        return;
    }

    const jobInfo = item.jobInfo;

    if (jobInfo.state !== JobState.QUEUED) {
        const proceed = await vscode.window.showWarningMessage(
            `Job "${jobInfo.jobId}" is ${jobInfo.state}, not QUEUED. Reprioritization only affects queued jobs and will have no effect. Continue anyway?`,
            'Continue',
            'Cancel'
        );
        if (proceed !== 'Continue') {
            return;
        }
    }

    const currentPriority = jobInfo.priority?.toString() ?? '1000';
    const input = await vscode.window.showInputBox({
        prompt: `Enter new priority for job "${jobInfo.jobId}"`,
        value: currentPriority,
        placeHolder: '1000',
        validateInput: (value) => {
            const num = Number(value);
            if (!value || isNaN(num) || !Number.isInteger(num) || num < 0) {
                return 'Priority must be a non-negative integer';
            }
            return undefined;
        }
    });

    if (input === undefined) {
        return; // User cancelled
    }

    const newPriority = parseInt(input, 10);

    try {
        const results = await client.reprioritizeJobs(
            jobInfo.queue,
            jobInfo.jobSetId,
            [jobInfo.jobId],
            newPriority
        );

        const errorMsg = results.get(jobInfo.jobId);
        if (errorMsg) {
            vscode.window.showErrorMessage(`Failed to reprioritize job: ${errorMsg}`);
        } else {
            jobInfo.priority = newPriority;
            vscode.window.showInformationMessage(`Job "${jobInfo.jobId}" reprioritized to ${newPriority}.`);
        }
    } catch (error: any) {
        const message = error.message ?? String(error);
        if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('unauthorized')) {
            vscode.window.showErrorMessage(`Permission denied: you do not have permission to reprioritize jobs in this queue.`);
        } else {
            vscode.window.showErrorMessage(`Failed to reprioritize job: ${message}`);
        }
    }
}
