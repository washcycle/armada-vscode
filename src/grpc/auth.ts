import * as grpc from '@grpc/grpc-js';
import { execFile } from 'child_process';
import { ResolvedConfig } from '../types/config';

/**
 * Build the value for the gRPC `authorization` metadata header from the
 * resolved config, or return undefined when the context has no credentials.
 *
 * Basic auth produces `Basic base64(user:pass)`; token-based schemes produce
 * `Bearer <token>`.
 */
export async function buildAuthHeader(auth: ResolvedConfig['auth']): Promise<string | undefined> {
    if (!auth || auth.type === 'none') {
        return undefined;
    }

    if (auth.type === 'basic') {
        const { username, password } = auth.credentials ?? {};
        if (!username) {
            return undefined;
        }
        const encoded = Buffer.from(`${username}:${password ?? ''}`).toString('base64');
        return `Basic ${encoded}`;
    }

    if (auth.type === 'exec') {
        const token = await runExecAuth(auth.credentials);
        return token ? `Bearer ${token}` : undefined;
    }

    if (auth.type === 'oidc') {
        // Interactive OIDC (browser device/authorization-code flow against
        // `providerUrl`) is not implemented here. The Bearer plumbing below is
        // shared with execAuth, so once a token provider exists it only needs
        // to return the token string. Until then, tell the user rather than
        // silently sending an unauthenticated request.
        throw new OidcNotSupportedError(
            'openIdConnect auth is not yet supported by this extension. ' +
            'Use basicAuth or execAuth in your armadactl config, or run ' +
            '`armadactl` to obtain a token and expose it via execAuth.'
        );
    }

    return undefined;
}

/**
 * Raised when a context is configured for OIDC, which this extension cannot
 * yet acquire tokens for. Callers surface this to the user instead of silently
 * issuing an unauthenticated call.
 */
export class OidcNotSupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OidcNotSupportedError';
    }
}

/**
 * Run the configured `execAuth` command and return its stdout as a bearer
 * token. Mirrors armadactl's exec-credential behaviour: the command is expected
 * to print the token to stdout.
 */
async function runExecAuth(credentials: any): Promise<string | undefined> {
    const cmd: string | undefined = credentials?.cmd;
    if (!cmd) {
        return undefined;
    }

    const args: string[] = credentials.args ?? [];
    const env = { ...process.env };
    for (const entry of credentials.env ?? []) {
        if (entry?.name) {
            env[entry.name] = entry.value;
        }
    }

    return new Promise((resolve, reject) => {
        execFile(cmd, args, { env, timeout: 30_000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(
                    `execAuth command "${cmd}" failed: ${error.message}` +
                    (stderr ? ` (stderr: ${String(stderr).trim()})` : '')
                ));
                return;
            }
            const token = String(stdout).trim();
            resolve(token.length > 0 ? token : undefined);
        });
    });
}

/**
 * Returns true when the given channel credentials carry TLS. Call credentials
 * may only be attached to secure channels — `@grpc/grpc-js` throws
 * "Cannot use call credentials with an insecure connection" otherwise — so
 * insecure channels have to fall back to per-call metadata.
 */
export function isSecureCredentials(credentials: grpc.ChannelCredentials): boolean {
    return credentials._isSecure();
}

/**
 * Wrap channel credentials so that every call on the resulting channel carries
 * the `authorization` header.
 *
 * Returns the credentials unchanged when there is no auth header, or when the
 * channel is insecure (gRPC forbids call credentials in plaintext). In the
 * insecure case the caller must attach metadata per call instead — see
 * `ArmadaClient.buildCallMetadata`.
 */
export function withCallCredentials(
    channelCredentials: grpc.ChannelCredentials,
    headerProvider: () => Promise<string | undefined>
): grpc.ChannelCredentials {
    if (!isSecureCredentials(channelCredentials)) {
        return channelCredentials;
    }

    const callCredentials = grpc.credentials.createFromMetadataGenerator(
        (_params, callback) => {
            headerProvider()
                .then(header => {
                    const metadata = new grpc.Metadata();
                    if (header) {
                        metadata.set('authorization', header);
                    }
                    callback(null, metadata);
                })
                .catch(error => callback(error as Error));
        }
    );

    return grpc.credentials.combineChannelCredentials(channelCredentials, callCredentials);
}

/**
 * A gRPC interceptor that adds the `authorization` header to every outgoing
 * call, unary or streaming.
 *
 * This is the fallback for insecure channels, where `combineChannelCredentials`
 * refuses to attach call credentials ("Cannot compose insecure credentials").
 * Applying it as an interceptor covers every method on the client without
 * having to thread metadata through each call site.
 */
export function makeAuthInterceptor(
    headerProvider: () => Promise<string | undefined>,
    onError?: (message: string) => void
): grpc.Interceptor {
    return (options, nextCall) => {
        return new grpc.InterceptingCall(nextCall(options), {
            start(metadata, listener, next) {
                headerProvider()
                    .then(header => {
                        if (header) {
                            metadata.set('authorization', header);
                        }
                        next(metadata, listener);
                    })
                    .catch(error => {
                        // Proceed without the header rather than hanging the
                        // call; the server will reject it and the reason is
                        // logged here.
                        if (onError) {
                            onError(`Could not build auth header: ${(error as Error).message}`);
                        }
                        next(metadata, listener);
                    });
            }
        });
    };
}
