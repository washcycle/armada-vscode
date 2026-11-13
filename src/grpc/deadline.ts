import * as grpc from '@grpc/grpc-js';

/** Default deadline for unary RPCs (submit, cancel, queries, logs). */
export const DEFAULT_UNARY_TIMEOUT_MS = 30_000;

/** Deadline for the connection probe behind "Test Connection". */
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/** gRPC status code for DEADLINE_EXCEEDED. */
export const DEADLINE_EXCEEDED = 4;

/**
 * Give every unary call a deadline unless the caller set one.
 *
 * Without a deadline, a call to a host that silently drops packets (a
 * firewall, VPN or cloud security group) never settles: grpc-js keeps the
 * channel in CONNECTING and the call waits indefinitely. Streaming calls are
 * left alone because event streams are meant to stay open.
 */
export function makeDeadlineInterceptor(timeoutMs: number = DEFAULT_UNARY_TIMEOUT_MS): grpc.Interceptor {
    return (options, nextCall) => {
        const def = options.method_definition;
        const unary = def && !def.requestStream && !def.responseStream;
        if (unary && options.deadline === undefined) {
            options = { ...options, deadline: Date.now() + timeoutMs };
        }
        return new grpc.InterceptingCall(nextCall(options));
    };
}

/** User-facing explanation for a DEADLINE_EXCEEDED on a given endpoint. */
export function describeTimeout(url: string, timeoutMs: number): string {
    return `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${url}. ` +
        'The host may be unreachable or behind a firewall/VPN, or the server may expect ' +
        'TLS when the extension is using plaintext (or vice versa — see forceNoTls).';
}
