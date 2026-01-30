import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from './config/configManager';
import { ArmadaClient } from './grpc/armadaClient';
import { JobTreeProvider } from './providers/jobTreeProvider';
import { submitJobCommand } from './commands/submitJob';
import { setupConfigCommand } from './commands/setupConfig';
import { switchContextCommand } from './commands/switchContext';
import { refreshJobsCommand } from './commands/refreshJobs';
import { refreshJobsQueryAPICommand } from './commands/refreshJobsQueryAPI';
import { cancelJobCommand } from './commands/cancelJob';
import { browseQueuesCommand } from './commands/browseQueues';
import { browseActiveQueuesCommand } from './commands/browseActiveQueues';
import { loadJobSetCommand } from './commands/loadJobSet';
import { viewJobLogsCommand } from './commands/viewJobLogs';
import { browseJobSetsCommand } from './commands/browseJobSets';
import { clearMonitoredJobSetsCommand } from './commands/clearMonitoredJobSets';
import { createQueueCommand } from './commands/createQueue';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Armada extension is now active');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Armada');
    context.subscriptions.push(outputChannel);

    // Initialize managers
    const configManager = new ConfigManager(outputChannel);
    let armadaClient: ArmadaClient | undefined;

    // Try to load config and initialize client
    try {
        const config = await configManager.loadConfig();
        if (config) {
            armadaClient = new ArmadaClient(config);
        } else {
            // Config file not found
            outputChannel.appendLine('No Armada configuration found');
            vscode.window.showWarningMessage(
                'Armada configuration not found. Click "Setup Configuration" to get started.',
                'Setup Configuration',
                'View Output'
            ).then(selection => {
                if (selection === 'Setup Configuration') {
                    vscode.commands.executeCommand('armada.setupConfig');
                } else if (selection === 'View Output') {
                    outputChannel.show();
                }
            });
        }
    } catch (error: any) {
        outputChannel.appendLine(`Failed to load Armada config: ${error.message}`);
        outputChannel.show();
        vscode.window.showErrorMessage(
            `Failed to load Armada config: ${error.message}`,
            'View Output'
        ).then(selection => {
            if (selection === 'View Output') {
                outputChannel.show();
            }
        });
    }

    // Initialize job tree provider with context for persistence
    const jobTreeProvider = new JobTreeProvider(armadaClient, context);
    const treeView = vscode.window.createTreeView('armadaJobsView', {
        treeDataProvider: jobTreeProvider,
        showCollapseAll: true
    });

    // Update status bar
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.command = 'armada.switchContext';

    const updateStatusBar = () => {
        const config = configManager.getCurrentConfig();
        if (config) {
            statusBarItem.text = `$(server-process) Armada: ${config.currentContext || 'default'}`;
            statusBarItem.tooltip = `Connected to ${config.armadaUrl}\nClick to switch context`;
            statusBarItem.show();
            vscode.commands.executeCommand('setContext', 'armada.configured', true);
        } else {
            statusBarItem.text = '$(warning) Armada: Not configured';
            statusBarItem.tooltip = 'Click to setup configuration';
            statusBarItem.show();
            vscode.commands.executeCommand('setContext', 'armada.configured', false);
        }
    };
    updateStatusBar();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('armada.submitJob', (options?: { skipConfirmation?: boolean }) =>
            submitJobCommand(armadaClient, configManager, jobTreeProvider, options)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.setupConfig', async () => {
            await setupConfigCommand(configManager);
            // Reload client after config setup
            const config = await configManager.loadConfig();
            if (config) {
                armadaClient = new ArmadaClient(config);
                jobTreeProvider.updateClient(armadaClient);
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.switchContext', async () => {
            const previousContext = configManager.getCurrentConfig()?.currentContext;
            await switchContextCommand(configManager);
            // Get updated config after context switch
            const config = configManager.getCurrentConfig();
            const newContext = config?.currentContext;

            // Only reinitialize if context actually changed or config was reloaded
            if (config && (previousContext !== newContext)) {
                armadaClient = new ArmadaClient(config);
                jobTreeProvider.updateClient(armadaClient);
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.refreshJobs', () =>
            refreshJobsCommand(jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.refreshJobsQueryAPI', () =>
            refreshJobsQueryAPICommand(jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.cancelJob', (item) =>
            cancelJobCommand(armadaClient, item)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.viewJobLogs', (item) =>
            viewJobLogsCommand(armadaClient, item)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.browseQueues', () =>
            browseQueuesCommand(armadaClient, jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.browseActiveQueues', () =>
            browseActiveQueuesCommand(armadaClient, jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.loadJobSet', () =>
            loadJobSetCommand(jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.browseJobSets', () =>
            browseJobSetsCommand(armadaClient, jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.clearMonitoredJobSets', () =>
            clearMonitoredJobSetsCommand(jobTreeProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('armada.createQueue', () =>
            createQueueCommand(armadaClient)
        )
    );

    // Watch config file for changes
    const configPath = vscode.workspace.getConfiguration('armada').get<string>('configPath') ||
                      path.join(os.homedir(), '.armadactl.yaml');

    const configFileWatcher = vscode.workspace.createFileSystemWatcher(configPath);

    configFileWatcher.onDidChange(async () => {
        outputChannel.appendLine('Config file changed, reloading...');
        try {
            const config = await configManager.loadConfig();
            if (config) {
                armadaClient = new ArmadaClient(config);
                jobTreeProvider.updateClient(armadaClient);
                updateStatusBar();
                vscode.window.showInformationMessage('Armada configuration reloaded');
            }
        } catch (error: any) {
            outputChannel.appendLine(`Failed to reload config: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to reload config: ${error.message}`);
        }
    });

    context.subscriptions.push(configFileWatcher);

    // Register tree view and status bar
    context.subscriptions.push(treeView);
    context.subscriptions.push(statusBarItem);

    // Auto-refresh jobs if enabled
    const config = vscode.workspace.getConfiguration('armada');
    if (config.get('autoRefresh', true)) {
        const interval = config.get('refreshInterval', 5000);
        const refreshTimer = setInterval(() => {
            if (armadaClient) {
                jobTreeProvider.refresh();
            }
        }, interval);

        context.subscriptions.push({
            dispose: () => clearInterval(refreshTimer)
        });
    }
}

export function deactivate() {
    console.log('Armada extension is now deactivated');
}
