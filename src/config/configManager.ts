import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { ArmadaConfig, ResolvedConfig, ArmadaContext } from '../types/config';

export class ConfigManager {
    private config: ArmadaConfig | null = null;
    private resolvedConfig: ResolvedConfig | null = null;
    private pendingSave: Promise<void> = Promise.resolve();
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Get the config file path from settings or default location
     */
    private getConfigPath(): string {
        const userConfigPath = vscode.workspace.getConfiguration('armada').get<string>('configPath');
        if (userConfigPath && userConfigPath.trim() !== '') {
            // Expand ~ to home directory if present
            if (userConfigPath.startsWith('~')) {
                return path.join(os.homedir(), userConfigPath.slice(1));
            }
            return userConfigPath;
        }
        return path.join(os.homedir(), '.armadactl.yaml');
    }

    /**
     * Load and parse the Armada config file
     */
    async loadConfig(): Promise<ResolvedConfig | null> {
        const configPath = this.getConfigPath();
        this.outputChannel.appendLine(`Loading Armada config from: ${configPath}`);

        try {
            const configContent = await fs.readFile(configPath, 'utf-8');
            this.config = yaml.load(configContent) as ArmadaConfig;

            // Resolve the active context
            this.resolvedConfig = this.resolveConfig(this.config);
            this.outputChannel.appendLine(`Config loaded successfully. Context: ${this.resolvedConfig?.currentContext || 'default'}`);
            return this.resolvedConfig;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.outputChannel.appendLine(`Config file not found at: ${configPath}`);
                this.outputChannel.appendLine('You can create a config file by running: cp operator/quickstart/armadactl.yaml ~/.armadactl.yaml');
                return null;
            }
            this.outputChannel.appendLine(`Error loading config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Resolve the active configuration from config file
     */
    private resolveConfig(config: ArmadaConfig): ResolvedConfig | null {
        // Handle context-based config
        if (config.contexts && Object.keys(config.contexts).length > 0) {
            const contextName = config.currentContext || Object.keys(config.contexts)[0];
            const context = config.contexts[contextName];

            if (!context) {
                throw new Error(`Context "${contextName}" not found in config`);
            }

            return {
                armadaUrl: context.armadaUrl,
                binocularsUrl: context.binocularsUrl,
                binocularsUrlPattern: context.binocularsUrlPattern,
                lookoutUrl: context.lookoutUrl,
                forceNoTls: context.forceNoTls,
                caCertPath: this.resolveCaCertPath(context.caCertPath),
                useSystemCertificates: this.useSystemCertificates(),
                currentContext: contextName,
                auth: this.extractAuth(context)
            };
        }

        // Handle legacy format (direct config)
        if (config.armadaUrl) {
            return {
                armadaUrl: config.armadaUrl,
                forceNoTls: (config as any).forceNoTls,
                caCertPath: this.resolveCaCertPath((config as any).caCertPath),
                useSystemCertificates: this.useSystemCertificates(),
                auth: this.extractAuth(config as any)
            };
        }

        return null;
    }

    /**
     * Pick the CA bundle to trust for TLS.
     *
     * A per-context `caCertPath` in the armadactl config wins, so different
     * clusters can use different bundles; the `armada.caCertPath` setting is the
     * fallback for the common case of one corporate proxy in front of
     * everything.
     */
    private resolveCaCertPath(contextCaCertPath?: string): string | undefined {
        if (contextCaCertPath && contextCaCertPath.trim() !== '') {
            return contextCaCertPath;
        }
        const setting = vscode.workspace.getConfiguration('armada').get<string>('caCertPath');
        return setting && setting.trim() !== '' ? setting : undefined;
    }

    /**
     * Whether to trust the OS certificate store in addition to Node's bundled
     * roots. On by default so a corporate CA installed by IT (Zscaler,
     * Netskope) works without configuration.
     */
    private useSystemCertificates(): boolean {
        return vscode.workspace.getConfiguration('armada').get<boolean>('useSystemCertificates', true) !== false;
    }

    /**
     * Extract authentication information from context
     */
    private extractAuth(context: ArmadaContext): ResolvedConfig['auth'] {
        if (context.openIdConnect) {
            return {
                type: 'oidc',
                credentials: context.openIdConnect
            };
        }

        if (context.basicAuth) {
            return {
                type: 'basic',
                credentials: context.basicAuth
            };
        }

        if (context.execAuth) {
            return {
                type: 'exec',
                credentials: context.execAuth
            };
        }

        return {
            type: 'none'
        };
    }

    /**
     * Get the current loaded config
     */
    getCurrentConfig(): ResolvedConfig | null {
        return this.resolvedConfig;
    }

    /**
     * Get all available contexts
     */
    getContexts(): string[] {
        if (!this.config || !this.config.contexts) {
            return [];
        }
        return Object.keys(this.config.contexts);
    }

    /**
     * Switch to a different context
     */
    async switchContext(contextName: string): Promise<void> {
        if (!this.config) {
            throw new Error('No config loaded');
        }

        if (!this.config.contexts || !this.config.contexts[contextName]) {
            throw new Error(`Context "${contextName}" not found`);
        }

        this.config.currentContext = contextName;
        this.resolvedConfig = this.resolveConfig(this.config);

        // Save the updated config
        await this.saveConfig();
    }

    /**
     * Save the current config to file
     */
    async saveConfig(): Promise<void> {
        if (!this.config) {
            throw new Error('No config to save');
        }

        // Writes are serialised and each one dumps the config at the moment it
        // runs. Concurrent fs.writeFile calls to the same file can finish out
        // of order, so rapid context switches could otherwise leave the file
        // on an older context than the one in memory and in the status bar.
        const write = async () => {
            if (!this.config) { return; }
            await this.writeConfigFile(this.getConfigPath(), yaml.dump(this.config));
        };
        const next = this.pendingSave.then(write, write);
        // Keep the chain alive after a failed write; the caller still sees the error.
        this.pendingSave = next.catch(() => undefined);
        return next;
    }

    /** Seam for tests: performs the actual file write. */
    protected async writeConfigFile(configPath: string, content: string): Promise<void> {
        await fs.writeFile(configPath, content, 'utf-8');
    }

    /**
     * Create a new config file with guided setup
     */
    async createConfig(armadaUrl: string, contextName: string = 'default'): Promise<void> {
        this.config = {
            currentContext: contextName,
            contexts: {
                [contextName]: {
                    armadaUrl: armadaUrl
                }
            }
        };

        await this.saveConfig();
        this.resolvedConfig = this.resolveConfig(this.config);
    }
}
