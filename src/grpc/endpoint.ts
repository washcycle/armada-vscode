/**
 * Parsing and TLS policy for gRPC endpoints (Armada and Binoculars).
 *
 * Every gRPC client goes through `parseEndpoint` so that the same URL forms
 * work everywhere: an optional, case-insensitive `http://` / `https://`
 * scheme, surrounding whitespace, a trailing slash or path, IPv6 literals in
 * brackets, and native gRPC `dns:` targets.
 */

export interface Endpoint {
    /** Scheme the user wrote, lower-cased; undefined when none was given. */
    scheme?: 'http' | 'https';
    /** Hostname without brackets (IPv6 literals are unwrapped). */
    host: string;
    port?: number;
    /** Target string to hand to grpc-js (`host:port`, `[v6]:port`, or the original `dns:` target). */
    target: string;
}

const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;

/**
 * Parse a user-supplied endpoint. Returns undefined when it isn't usable.
 */
export function parseEndpoint(raw: string): Endpoint | undefined {
    const input = (raw ?? '').trim();
    if (!input) {
        return undefined;
    }

    // Native gRPC naming (dns:host:port, dns:///host:port): pass through untouched.
    const dns = /^dns:(?:\/\/[^/]*\/)?(.+)$/i.exec(input);
    if (dns) {
        const inner = parseHostPort(dns[1].replace(/\/+$/, ''));
        return inner ? { ...inner, target: input } : undefined;
    }

    let rest = input;
    let scheme: Endpoint['scheme'];
    const schemeMatch = /^(https?):\/\//i.exec(rest);
    if (schemeMatch) {
        scheme = schemeMatch[1].toLowerCase() as Endpoint['scheme'];
        rest = rest.slice(schemeMatch[0].length);
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rest)) {
        return undefined; // some other scheme (grpc://, unix://, ...)
    }

    // Drop any path, query or fragment: gRPC targets are host[:port] only.
    rest = rest.split(/[/?#]/)[0];
    const hp = parseHostPort(rest);
    if (!hp) {
        return undefined;
    }
    return { scheme, ...hp, target: formatHostPort(hp.host, hp.port) };
}

function parseHostPort(text: string): { host: string; port?: number } | undefined {
    let host: string;
    let portText: string | undefined;

    const v6 = /^\[([0-9a-fA-F:.%]+)\](?::(\d+))?$/.exec(text);
    if (v6) {
        host = v6[1];
        portText = v6[2];
    } else {
        const m = /^([^:\s[\]]+)(?::(\d+))?$/.exec(text);
        if (!m) {
            return undefined;
        }
        host = m[1];
        portText = m[2];
    }

    if (portText === undefined) {
        return { host };
    }
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return undefined;
    }
    return { host, port };
}

export function formatHostPort(host: string, port?: number): string {
    const h = host.includes(':') ? `[${host}]` : host;
    return port === undefined ? h : `${h}:${port}`;
}

/** localhost names and loopback addresses. */
export function isLoopbackHost(host: string): boolean {
    const h = host.toLowerCase();
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || LOOPBACK_V4.test(h);
}

/**
 * Whether an endpoint is dialed over TLS.
 *
 * Mirrors armadactl (pkg/client/connection.go), which uses TLS unless
 * `forceNoTls` is set or the URL contains "localhost", so a context shared
 * between armadactl and the extension behaves the same in both:
 *
 * 1. `forceNoTls` → plaintext
 * 2. explicit `https://` → TLS; explicit `http://` → plaintext
 * 3. port 443 → TLS
 * 4. localhost / loopback addresses → plaintext (armadactl only exempts
 *    "localhost"; loopback IPs are exempted too so `127.0.0.1:30002`
 *    quickstart configs keep working)
 * 5. anything else → TLS
 *
 * Unparseable input falls back to TLS, the safe default.
 */
export function usesTls(url: string, forceNoTls?: boolean): boolean {
    if (forceNoTls) {
        return false;
    }
    const ep = parseEndpoint(url);
    if (!ep) {
        return true;
    }
    if (ep.scheme === 'https') { return true; }
    if (ep.scheme === 'http') { return false; }
    if (ep.port === 443) { return true; }
    return !isLoopbackHost(ep.host);
}

/** Human-readable reason for the TLS decision, for the config panel and logs. */
export function describeTlsMode(url: string, forceNoTls?: boolean): string {
    if (forceNoTls) { return 'Disabled (forceNoTls)'; }
    const ep = parseEndpoint(url);
    if (!ep) { return 'Enabled (default)'; }
    if (ep.scheme === 'https') { return 'Enabled (https://)'; }
    if (ep.scheme === 'http') { return 'Disabled (http://)'; }
    if (ep.port === 443) { return 'Enabled (port 443)'; }
    return isLoopbackHost(ep.host) ? 'Disabled (localhost)' : 'Enabled (default, as armadactl)';
}
