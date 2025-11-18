import * as vscode from 'vscode';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function loadJobSetCommand(jobTreeProvider: JobTreeProvider): Promise<void> {
    try {
        // Ask for queue name
        const queue = await vscode.window.showInputBox({
            prompt: 'Enter queue name',
            placeHolder: 'e.g., test, production',
            validateInput: (value) => {
                return value.trim() ? null : 'Queue name cannot be empty';
            }
        });

        if (!queue) {
            return; // User cancelled
        }

        // Ask for job set ID
        const jobSetId = await vscode.window.showInputBox({
            prompt: `Enter Job Set ID for queue "${queue}"`,
            placeHolder: 'e.g., my-job-set-123',
            validateInput: (value) => {
                return value.trim() ? null : 'Job Set ID cannot be empty';
            }
        });

        if (!jobSetId) {
            return; // User cancelled
        }

        // Load the job set
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading job set "${jobSetId}" from queue "${queue}"...`,
                cancellable: false
            },
            async () => {
                await jobTreeProvider.loadJobsFromQueue(queue.trim(), jobSetId.trim());
            }
        );

        vscode.window.showInformationMessage(
            `Monitoring job set "${jobSetId}" in queue "${queue}"`
        );
    } catch (error: any) {
        console.error('[Armada] Failed to load job set:', error);
        vscode.window.showErrorMessage(`Failed to load job set: ${error.message}`);
    }
}
