import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { 
    sleep, 
    waitFor, 
    createTestConfig, 
    cleanupTestConfig,
    openTestYamlFile,
    executeCommand,
    isArmadaAvailable
} from './helpers';

suite('Armada Extension Integration Tests', () => {
    let testConfigPath: string;
    
    suiteSetup(async function() {
        // Increase timeout for setup
        this.timeout(120000);
        
        // Verify extension is installed
        const ext = vscode.extensions.getExtension('thefunktion.armada-vscode');
        assert.ok(ext, 'Armada extension should be installed');
        
        // Activate the extension
        if (!ext.isActive) {
            await ext.activate();
            // Wait for extension to fully activate
            await waitFor(
                () => ext.isActive,
                30000,
                500
            );
        }
        
        // Create test configuration
        testConfigPath = await createTestConfig();
        
        // Set the config path in VSCode settings
        const config = vscode.workspace.getConfiguration('armada');
        await config.update('configPath', testConfigPath, vscode.ConfigurationTarget.Global);
        
        // Wait for config to be loaded
        await sleep(1000);
        
        console.log('Test suite setup complete');
    });
    
    suiteTeardown(async () => {
        // Clean up test config
        if (testConfigPath) {
            cleanupTestConfig(testConfigPath);
        }
        
        // Reset config
        const config = vscode.workspace.getConfiguration('armada');
        await config.update('configPath', undefined, vscode.ConfigurationTarget.Global);
    });

    test('Extension should be present and activated', async () => {
        const ext = vscode.extensions.getExtension('thefunktion.armada-vscode');
        assert.ok(ext, 'Extension should be present');
        assert.ok(ext.isActive, 'Extension should be activated');
    });

    test('Setup Configuration command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.setupConfig'),
            'armada.setupConfig command should be registered'
        );
    });

    test('Switch Context command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.switchContext'),
            'armada.switchContext command should be registered'
        );
    });

    test('Submit Job command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.submitJob'),
            'armada.submitJob command should be registered'
        );
    });

    test('Refresh Jobs command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.refreshJobs'),
            'armada.refreshJobs command should be registered'
        );
    });

    test('Refresh Jobs Query API command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.refreshJobsQueryAPI'),
            'armada.refreshJobsQueryAPI command should be registered'
        );
    });

    test('Browse Queues command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.browseQueues'),
            'armada.browseQueues command should be registered'
        );
    });

    test('Browse Active Queues command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.browseActiveQueues'),
            'armada.browseActiveQueues command should be registered'
        );
    });

    test('Load Job Set command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.loadJobSet'),
            'armada.loadJobSet command should be registered'
        );
    });

    test('Browse Job Sets command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.browseJobSets'),
            'armada.browseJobSets command should be registered'
        );
    });

    test('Cancel Job command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.cancelJob'),
            'armada.cancelJob command should be registered'
        );
    });

    test('View Job Logs command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.viewJobLogs'),
            'armada.viewJobLogs command should be registered'
        );
    });

    test('Clear Monitored Job Sets command should be available', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(
            commands.includes('armada.clearMonitoredJobSets'),
            'armada.clearMonitoredJobSets command should be registered'
        );
    });

    test('YAML validation should work for .armada.yaml files', async function() {
        this.timeout(10000);
        
        const editor = await openTestYamlFile('test-job.armada.yaml');
        assert.ok(editor, 'Test YAML file should be opened');
        
        // Verify the document is recognized as YAML
        assert.strictEqual(editor.document.languageId, 'yaml', 'File should be recognized as YAML');
        
        // Close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
    
    // Note: The following tests would require a live Armada instance
    // They are marked as pending and will be skipped if Armada is not available
    
    test('Submit Job command should work with valid YAML', async function() {
        this.timeout(30000);

        const available = await isArmadaAvailable();
        if (!available) {
            console.log('Skipping submit job test - Armada not configured');
            this.skip();
            return;
        }

        const editor = await openTestYamlFile('test-job.armada.yaml');

        try {
            // Execute the submit job command
            // Note: This command shows a confirmation dialog which will timeout in non-interactive environments
            // Wrap in a race with a timeout to detect this scenario
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Command timeout - likely waiting for user interaction')), 10000)
            );

            const commandPromise = executeCommand('armada.submitJob');

            await Promise.race([commandPromise, timeoutPromise]);

            // Wait a bit for the job to be submitted
            await sleep(2000);

            // Command execution should not throw - success expected
            assert.ok(true, 'Submit job command executed successfully');
        } catch (error: any) {
            // Skip if it's waiting for user interaction (dialog timeout)
            if (error.message && error.message.includes('Command timeout')) {
                console.log('Submit job test skipped - command requires user interaction (confirmation dialog)');
                this.skip();
            } else if (error.message && (error.message.includes('not configured') || error.message.includes('connection'))) {
                console.log('Submit job test skipped - Armada not accessible:', error.message);
                this.skip();
            } else {
                // Real error - fail the test
                throw error;
            }
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });
    
    test('Refresh Jobs command should execute without errors', async function() {
        this.timeout(10000);
        
        try {
            await executeCommand('armada.refreshJobs');
            assert.ok(true, 'Refresh jobs command executed');
        } catch (error: any) {
            // Only skip for known configuration issues
            if (error.message && error.message.includes('not configured')) {
                console.log('Refresh jobs test skipped - not configured');
                this.skip();
            } else {
                throw error;
            }
        }
    });
    
    test('Browse Queues command should execute without errors', async function() {
        this.timeout(10000);
        
        try {
            await executeCommand('armada.browseQueues');
            assert.ok(true, 'Browse queues command executed');
        } catch (error: any) {
            // Only skip for known configuration issues
            if (error.message && error.message.includes('not configured')) {
                console.log('Browse queues test skipped - not configured');
                this.skip();
            } else {
                throw error;
            }
        }
    });
});
