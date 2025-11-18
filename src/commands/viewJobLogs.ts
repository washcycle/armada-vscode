import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';

let logsOutputChannel: vscode.OutputChannel | undefined;

export async function viewJobLogsCommand(
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

    const jobId = item.jobInfo.jobId;
    const jobSetId = item.jobInfo.jobSetId;
    const queue = item.jobInfo.queue;

    try {
        // Create or clear output channel for logs
        if (!logsOutputChannel) {
            logsOutputChannel = vscode.window.createOutputChannel('Armada Job Logs');
        }
        logsOutputChannel.clear();
        logsOutputChannel.show();

        // Show progress while fetching logs
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Fetching logs for job ${jobId}...`,
                cancellable: false
            },
            async () => {
                // Get logs from Binoculars
                const logs = await client.getJobLogs(
                    jobId,
                    0, // pod number - default to 0
                    item.jobInfo.namespace, // namespace if available
                    undefined, // since_time - get all logs
                    1000 // tail last 1000 lines
                );

                // Display logs in output channel
                logsOutputChannel!.appendLine('='.repeat(80));
                logsOutputChannel!.appendLine(`Job Logs: ${jobId}`);
                logsOutputChannel!.appendLine(`Queue: ${queue}`);
                logsOutputChannel!.appendLine(`Job Set: ${jobSetId}`);
                logsOutputChannel!.appendLine(`State: ${item.jobInfo.state}`);
                logsOutputChannel!.appendLine('='.repeat(80));
                logsOutputChannel!.appendLine('');

                if (logs.length === 0) {
                    logsOutputChannel!.appendLine('No logs available for this job.');
                    logsOutputChannel!.appendLine('');
                    logsOutputChannel!.appendLine('Possible reasons:');
                    logsOutputChannel!.appendLine('- Job has not started running yet');
                    logsOutputChannel!.appendLine('- Pod has not been created');
                    logsOutputChannel!.appendLine('- Logs have been rotated/deleted');
                } else {
                    logsOutputChannel!.appendLine(`Found ${logs.length} log lines:\n`);

                    for (const logLine of logs) {
                        const timestamp = logLine.timestamp ? `[${logLine.timestamp}] ` : '';
                        logsOutputChannel!.appendLine(`${timestamp}${logLine.line}`);
                    }
                }

                logsOutputChannel!.appendLine('');
                logsOutputChannel!.appendLine('='.repeat(80));
                logsOutputChannel!.appendLine('End of logs');
                logsOutputChannel!.appendLine('='.repeat(80));
            }
        );

        vscode.window.showInformationMessage(`Logs displayed for job ${jobId}`);
    } catch (error: any) {
        console.error('[Armada] Failed to get job logs:', error);

        if (logsOutputChannel) {
            logsOutputChannel.appendLine('');
            logsOutputChannel.appendLine(`ERROR: ${error.message}`);
            logsOutputChannel.appendLine('');
            logsOutputChannel.appendLine('Troubleshooting:');
            logsOutputChannel.appendLine('- Verify Binoculars service is running');
            logsOutputChannel.appendLine('- Check if the job has started running');
            logsOutputChannel.appendLine('- Ensure you have permissions to access logs');
        }

        vscode.window.showErrorMessage(`Failed to get logs: ${error.message}`);
    }
}
