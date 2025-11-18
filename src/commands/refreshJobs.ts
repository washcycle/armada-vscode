import * as vscode from 'vscode';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function refreshJobsCommand(jobTreeProvider: JobTreeProvider): Promise<void> {
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Refreshing jobs...',
                cancellable: false
            },
            async () => {
                await jobTreeProvider.refreshAllJobSets();
            }
        );
        vscode.window.showInformationMessage('Jobs refreshed successfully');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to refresh jobs: ${error.message}`);
    }
}
