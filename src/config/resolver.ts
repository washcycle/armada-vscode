// Pure functions, NO vscode import
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { ArmadaConfig, ResolvedConfig, ArmadaContext } from '../types/config';

/**
 * Extract authentication information from context
 */
function extractAuth(context: ArmadaContext): ResolvedConfig['auth'] {
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
 * Resolve the active configuration from a parsed ArmadaConfig object.
 * Handles both context-based and legacy armadaUrl formats.
 */
export function resolveArmadaConfig(config: ArmadaConfig): ResolvedConfig | null {
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
            currentContext: contextName,
            auth: extractAuth(context)
        };
    }

    // Handle legacy format (direct config)
    if (config.armadaUrl) {
        return {
            armadaUrl: config.armadaUrl,
            auth: extractAuth(config as any)
        };
    }

    return null;
}

/**
 * Reads a YAML config file at the given path, parses it, and resolves it.
 * Returns null if the file is not found (ENOENT). Throws on other errors.
 */
export async function loadArmadaConfig(configFilePath: string): Promise<ResolvedConfig | null> {
    try {
        const configContent = await fs.readFile(configFilePath, 'utf-8');
        const config = yaml.load(configContent) as ArmadaConfig;
        return resolveArmadaConfig(config);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
