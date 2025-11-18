import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager';

export async function setupConfigCommand(configManager: ConfigManager): Promise<void> {
    // Get Armada server URL
    const armadaUrl = await vscode.window.showInputBox({
        prompt: 'Enter Armada server URL (e.g., localhost:50051 or server.example.com:443)',
        placeHolder: 'localhost:50051',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Armada URL is required';
            }
            // Basic validation for host:port format
            const hostPortRegex = /^[a-zA-Z0-9.-]+:\d+$/;
            if (!hostPortRegex.test(value.trim())) {
                return 'URL must be in format host:port (e.g., localhost:50051)';
            }
            return null;
        }
    });

    if (!armadaUrl) {
        return; // User cancelled
    }

    // Get context name
    const contextName = await vscode.window.showInputBox({
        prompt: 'Enter a name for this configuration context',
        placeHolder: 'default',
        value: 'default',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Context name is required';
            }
            return null;
        }
    });

    if (!contextName) {
        return; // User cancelled
    }

    try {
        await configManager.createConfig(armadaUrl.trim(), contextName.trim());
        vscode.window.showInformationMessage(
            `Armada configuration created successfully! Connected to ${armadaUrl}`
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `Failed to create configuration: ${error.message}`
        );
    }
}
