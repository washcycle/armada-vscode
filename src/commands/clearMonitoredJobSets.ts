import * as vscode from 'vscode';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function clearMonitoredJobSetsCommand(jobTreeProvider: JobTreeProvider): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
        'Clear all monitored job sets? This will remove all job sets from the tree and clear saved selections.',
        { modal: true },
        'Clear All',
        'Cancel'
    );

    if (confirmation !== 'Clear All') {
        return;
    }

    try {
        await jobTreeProvider.clearMonitoredJobSets();
        vscode.window.showInformationMessage('All monitored job sets cleared');
    } catch (error: any) {
        console.error('[Armada] Failed to clear monitored job sets:', error);
        vscode.window.showErrorMessage(`Failed to clear job sets: ${error.message}`);
    }
}
