import * as vscode from 'vscode';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function refreshJobsQueryAPICommand(jobTreeProvider: JobTreeProvider): Promise<void> {
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Refreshing jobs using Query API...',
                cancellable: false
            },
            async () => {
                await jobTreeProvider.refreshJobsUsingQueryAPI();
            }
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to refresh jobs: ${error.message}`);
    }
}
