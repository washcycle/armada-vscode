import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';

export async function switchContextCommand(configManager: ConfigManager): Promise<void> {
    const contexts = configManager.getContexts();

    if (contexts.length === 0) {
        vscode.window.showWarningMessage(
            'No contexts found. Please setup configuration first.',
            'Setup Configuration'
        ).then(selection => {
            if (selection === 'Setup Configuration') {
                vscode.commands.executeCommand('armada.setupConfig');
            }
        });
        return;
    }

    if (contexts.length === 1) {
        vscode.window.showInformationMessage(
            `Only one context available: ${contexts[0]}`
        );
        return;
    }

    const currentConfig = configManager.getCurrentConfig();
    const currentContext = currentConfig?.currentContext;

    // Create quick pick items with current context marked
    const items = contexts.map(context => ({
        label: context,
        description: context === currentContext ? '$(check) Current' : '',
        context: context
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an Armada context to switch to'
    });

    if (!selected) {
        return; // User cancelled
    }

    if (selected.context === currentContext) {
        vscode.window.showInformationMessage(
            `Already using context: ${selected.context}`
        );
        return;
    }

    try {
        await configManager.switchContext(selected.context);
        vscode.window.showInformationMessage(
            `Switched to context: ${selected.context}`
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to switch context: ${error.message}`
        );
    }
}
