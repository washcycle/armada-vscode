import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { ArmadaClient } from '../grpc/armadaClient';
import { ConfigManager } from '../config/configManager';
import { JobTreeProvider } from '../providers/jobTreeProvider';
import { ArmadaJobSpec, JobState } from '../types/armada';

export async function submitJobCommand(
    client: ArmadaClient | undefined,
    configManager: ConfigManager,
    jobTreeProvider: JobTreeProvider
): Promise<void> {
    // Check if client is initialized
    if (!client) {
        const result = await vscode.window.showWarningMessage(
            'Armada is not configured. Would you like to set it up now?',
            'Setup Configuration'
        );

        if (result === 'Setup Configuration') {
            await vscode.commands.executeCommand('armada.setupConfig');
        }
        return;
    }

    // Get active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor. Please open an Armada job YAML file.');
        return;
    }

    // Validate file is YAML
    const document = editor.document;
    if (document.languageId !== 'yaml' && !document.fileName.endsWith('.yaml') && !document.fileName.endsWith('.yml')) {
        vscode.window.showErrorMessage('Current file is not a YAML file.');
        return;
    }

    try {
        // Parse YAML content
        const content = document.getText();
        const jobSpec = yaml.load(content) as ArmadaJobSpec;

        // Validate required fields
        if (!jobSpec.queue) {
            vscode.window.showErrorMessage('Job specification must include a "queue" field.');
            return;
        }

        if (!jobSpec.jobSetId) {
            vscode.window.showErrorMessage('Job specification must include a "jobSetId" field.');
            return;
        }

        if (!jobSpec.jobs || jobSpec.jobs.length === 0) {
            vscode.window.showErrorMessage('Job specification must include at least one job in the "jobs" array.');
            return;
        }

        // Confirm submission
        const jobCount = jobSpec.jobs.length;
        const confirmation = await vscode.window.showInformationMessage(
            `Submit ${jobCount} job${jobCount > 1 ? 's' : ''} to queue "${jobSpec.queue}"?`,
            'Submit',
            'Cancel'
        );

        if (confirmation !== 'Submit') {
            return;
        }

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Submitting jobs to Armada...',
                cancellable: false
            },
            async (progress) => {
                try {
                    const response = await client.submitJobs(jobSpec);

                    // Add each submitted job to the tree view
                    for (const jobResponse of response.jobIds) {
                        let jobId: string;

                        if (typeof jobResponse === 'string') {
                            jobId = jobResponse;
                        } else if (typeof jobResponse === 'object' && jobResponse !== null) {
                            jobId = (jobResponse as any).job_id || (jobResponse as any).jobId || String(jobResponse);
                        } else {
                            jobId = String(jobResponse);
                        }

                        jobTreeProvider.addJob({
                            jobId: jobId,
                            jobSetId: jobSpec.jobSetId,
                            queue: jobSpec.queue,
                            state: JobState.QUEUED,
                            created: new Date()
                        });
                    }

                    vscode.window.showInformationMessage(
                        `Successfully submitted ${response.jobIds.length} job${response.jobIds.length > 1 ? 's' : ''} to Armada!`
                    );

                } catch (error: any) {
                    throw error;
                }
            }
        );

    } catch (error: any) {
        if (error instanceof yaml.YAMLException) {
            vscode.window.showErrorMessage(
                `Invalid YAML: ${error.message}`
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to submit jobs: ${error.message}`
            );
        }
    }
}
