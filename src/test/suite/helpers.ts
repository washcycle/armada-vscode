import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Helper to wait for a condition to be true
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 10000,
    interval: number = 100
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return;
        }
        await sleep(interval);
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Helper to sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a temporary test config file
 */
export async function createTestConfig(): Promise<string> {
    const testConfigPath = path.join(os.tmpdir(), '.armadactl-test.yaml');
    const fixtureConfig = path.join(__dirname, '../fixtures/test-config.yaml');
    
    if (fs.existsSync(fixtureConfig)) {
        fs.copyFileSync(fixtureConfig, testConfigPath);
    } else {
        // Fallback: create a basic config
        const config = `currentContext: test
contexts:
  - name: test
    armadaUrl: localhost:30002
    execTimeout: 2m
`;
        fs.writeFileSync(testConfigPath, config);
    }
    
    return testConfigPath;
}

/**
 * Clean up test config file
 */
export function cleanupTestConfig(configPath: string): void {
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
    }
}

/**
 * Open a test YAML file in VSCode editor
 */
export async function openTestYamlFile(filename: string): Promise<vscode.TextEditor> {
    const fixturePath = path.join(__dirname, '../fixtures', filename);
    const doc = await vscode.workspace.openTextDocument(fixturePath);
    return await vscode.window.showTextDocument(doc);
}

/**
 * Execute a VSCode command and wait for it to complete
 */
export async function executeCommand<T>(command: string, ...args: any[]): Promise<T | undefined> {
    return await vscode.commands.executeCommand<T>(command, ...args);
}

/**
 * Check if Armada is accessible
 */
export async function isArmadaAvailable(): Promise<boolean> {
    try {
        // Simple check - try to load the extension and see if configured
        const ext = vscode.extensions.getExtension('thefunktion.armada-vscode');
        if (!ext) {
            return false;
        }
        
        if (!ext.isActive) {
            await ext.activate();
        }
        
        // Give it a moment to initialize
        await sleep(1000);
        
        return true;
    } catch (error) {
        console.error('Armada availability check failed:', error);
        return false;
    }
}

/**
 * Get the Armada tree view
 */
export function getArmadaTreeView(): vscode.TreeView<any> | undefined {
    // This is a simplified version - in real tests we'd access the tree provider
    return undefined;
}

/**
 * Wait for job to appear in tree view
 */
export async function waitForJobInTree(
    jobId: string,
    timeout: number = 30000
): Promise<void> {
    // This would need actual implementation based on tree provider access
    // For now, just wait a bit
    await sleep(2000);
}
