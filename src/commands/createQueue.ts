import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobTreeProvider } from '../providers/jobTreeProvider';

export async function createQueueCommand(
    client: ArmadaClient | undefined,
    jobTreeProvider?: JobTreeProvider
): Promise<void> {
    if (!client) {
        vscode.window.showWarningMessage('Armada is not configured');
        return;
    }

    try {
        // Prompt for queue name
        const queueName = await vscode.window.showInputBox({
            prompt: 'Enter queue name',
            placeHolder: 'my-queue',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Queue name is required';
                }
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Queue name must contain only lowercase letters, numbers, and hyphens';
                }
                return undefined;
            }
        });

        if (!queueName) {
            return; // User cancelled
        }

        // Prompt for priority factor
        const priorityFactorStr = await vscode.window.showInputBox({
            prompt: 'Enter priority factor (default: 1.0)',
            placeHolder: '1.0',
            value: '1.0',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return undefined; // Allow empty, will use default
                }
                const num = parseFloat(value);
                if (isNaN(num) || num <= 0) {
                    return 'Priority factor must be a positive number';
                }
                return undefined;
            }
        });

        if (priorityFactorStr === undefined) {
            return; // User cancelled
        }

        const priorityFactor = priorityFactorStr.trim() ? parseFloat(priorityFactorStr) : 1.0;

        // Prompt for user owners (optional)
        const userOwnersStr = await vscode.window.showInputBox({
            prompt: 'Enter user owners (comma-separated, optional)',
            placeHolder: 'user1@example.com,user2@example.com'
        });

        if (userOwnersStr === undefined) {
            return; // User cancelled
        }

        const userOwners = userOwnersStr
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Prompt for group owners (optional)
        const groupOwnersStr = await vscode.window.showInputBox({
            prompt: 'Enter group owners (comma-separated, optional)',
            placeHolder: 'group1,group2'
        });

        if (groupOwnersStr === undefined) {
            return; // User cancelled
        }

        const groupOwners = groupOwnersStr
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Build queue object
        const queue = {
            name: queueName,
            priority_factor: priorityFactor,
            user_owners: userOwners,
            group_owners: groupOwners
        };

        // Create the queue
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Creating queue "${queueName}"...`,
                cancellable: false
            },
            async () => {
                await client.createQueue(queue);
            }
        );

        vscode.window.showInformationMessage(
            `Queue "${queueName}" created successfully`
        );

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create queue: ${error.message}`);
    }
}
