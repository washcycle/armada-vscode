import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { ArmadaClient } from '../grpc/armadaClient';
import { ConfigManager } from '../config/configManager';
import { JobTreeProvider } from '../providers/jobTreeProvider';
import { ArmadaJobSpec, JobState } from '../types/armada';
import { readPodSpecs } from '../grpc/podSpecConverter';

/**
 * Indices of jobs that carry no usable pod spec under either accepted name.
 *
 * Exported for tests; the server's own complaint names neither the job nor the
 * field, so this check is what makes the failure actionable.
 */
export function findJobsWithoutPodSpec(jobs: any[]): number[] {
    const missing: number[] = [];
    jobs.forEach((job, index) => {
        if (!job || typeof job !== 'object') {
            missing.push(index);
            return;
        }
        const specs = readPodSpecs(job);
        const hasContainers = specs.some(spec =>
            Array.isArray(spec.containers) && spec.containers.length > 0
        );
        if (!hasContainers) {
            missing.push(index);
        }
    });
    return missing;
}

export async function submitJobCommand(
    client: ArmadaClient | undefined,
    configManager: ConfigManager,
    jobTreeProvider: JobTreeProvider,
    options?: { skipConfirmation?: boolean }
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

        // Catch a missing pod spec here rather than letting the server answer
        // with a bare "Job must contain at least one PodSpec", which does not
        // say which job or which field is at fault.
        const missingPodSpec = findJobsWithoutPodSpec(jobSpec.jobs);
        if (missingPodSpec.length > 0) {
            const list = missingPodSpec.map(index => `jobs[${index}]`).join(', ');
            vscode.window.showErrorMessage(
                `No pod spec found for ${list}. Each job needs a "podSpec" (or "podSpecs") ` +
                'containing at least one container.'
            );
            return;
        }

        // Confirm submission (unless skipConfirmation is set)
        const jobCount = jobSpec.jobs.length;
        if (!options?.skipConfirmation) {
            const confirmation = await vscode.window.showInformationMessage(
                `Submit ${jobCount} job${jobCount > 1 ? 's' : ''} to queue "${jobSpec.queue}"?`,
                'Submit',
                'Cancel'
            );

            if (confirmation !== 'Submit') {
                return;
            }
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

                    // Only accepted jobs go in the tree. Adding rejected ones
                    // created entries that could never resolve.
                    for (const jobId of response.jobIds) {
                        jobTreeProvider.addJob({
                            jobId: jobId,
                            jobSetId: jobSpec.jobSetId,
                            queue: jobSpec.queue,
                            state: JobState.QUEUED,
                            created: new Date()
                        });
                    }

                    const accepted = response.jobIds.length;
                    const rejected = response.rejected;

                    if (rejected.length === 0) {
                        vscode.window.showInformationMessage(
                            `Successfully submitted ${accepted} job${accepted === 1 ? '' : 's'} to Armada!`
                        );
                    } else {
                        // A partial success used to be reported as a total one.
                        const reasons = rejected
                            .map(failure => `jobs[${failure.index}]: ${failure.error}`)
                            .join('; ');
                        const detail = `${rejected.length} of ${accepted + rejected.length} job(s) rejected by Armada — ${reasons}`;
                        if (accepted === 0) {
                            vscode.window.showErrorMessage(detail);
                        } else {
                            vscode.window.showWarningMessage(
                                `Submitted ${accepted} job${accepted === 1 ? '' : 's'}, but ${detail}`
                            );
                        }
                    }

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
