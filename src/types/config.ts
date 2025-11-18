/**
 * Armada configuration types based on armadactl config structure
 */

export interface OpenIdConnect {
    providerUrl: string;
    clientId: string;
    localPort?: number;
    useAccessToken?: boolean;
    scopes?: string[];
}

export interface ExecAuth {
    cmd: string;
    args?: string[];
    env?: Array<{ name: string; value: string }>;
    interactive?: boolean;
}

export interface ArmadaContext {
    armadaUrl: string;
    binocularsUrl?: string;
    binocularsUrlPattern?: string; // Pattern with {CLUSTER_ID} placeholder
    openIdConnect?: OpenIdConnect;
    execAuth?: ExecAuth;
    basicAuth?: {
        username: string;
        password: string;
    };
}

export interface ArmadaConfig {
    currentContext?: string;
    contexts?: Record<string, ArmadaContext>;
    // Legacy format (direct config without contexts)
    armadaUrl?: string;
    openIdConnect?: OpenIdConnect;
    execAuth?: ExecAuth;
}

export interface ResolvedConfig {
    armadaUrl: string;
    binocularsUrl?: string;
    binocularsUrlPattern?: string; // Pattern with {CLUSTER_ID} placeholder
    currentContext?: string;
    auth?: {
        type: 'oidc' | 'basic' | 'exec' | 'none';
        credentials?: any;
    };
}
