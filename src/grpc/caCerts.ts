import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';

/**
 * Raised when a configured CA bundle cannot be used. Carries the resolved path
 * so callers can tell the user exactly which file to fix.
 */
export class CaCertError extends Error {
    readonly certPath: string;

    constructor(certPath: string, message: string) {
        super(message);
        this.name = 'CaCertError';
        this.certPath = certPath;
    }
}

/**
 * Expand a leading `~` and make the path absolute, so settings can use the
 * same shorthand users type in a shell.
 */
export function resolveCertPath(certPath: string): string {
    const expanded = certPath.startsWith('~')
        ? path.join(os.homedir(), certPath.slice(1))
        : certPath;
    return path.resolve(expanded);
}

/**
 * Read a PEM CA bundle from disk.
 *
 * Returns undefined when no path is configured, which means "use Node's
 * built-in trust store". Throws CaCertError when a path *is* configured but
 * unusable — a silent fallback there would look identical to a genuine
 * certificate rejection and send users chasing the wrong problem.
 */
export function loadCaCerts(certPath: string | undefined): Buffer | undefined {
    if (!certPath || certPath.trim() === '') {
        return undefined;
    }

    const resolved = resolveCertPath(certPath.trim());

    let contents: Buffer;
    try {
        contents = fs.readFileSync(resolved);
    } catch (error: any) {
        const reason = error?.code === 'ENOENT'
            ? 'file not found'
            : error?.code === 'EACCES'
                ? 'permission denied'
                : error?.message ?? String(error);
        throw new CaCertError(resolved, `Cannot read CA certificate bundle at ${resolved}: ${reason}`);
    }

    if (!contents.includes('-----BEGIN CERTIFICATE-----')) {
        throw new CaCertError(
            resolved,
            `${resolved} does not look like a PEM certificate bundle ` +
            '(no "-----BEGIN CERTIFICATE-----" block found). ' +
            'DER/CRT files must be converted first: ' +
            `openssl x509 -inform der -in <file> -out bundle.pem`
        );
    }

    return contents;
}

/**
 * Count the certificates in a PEM bundle, for logging. Corporate bundles
 * usually contain a whole chain, and the count is a quick sanity check that the
 * right file was picked up.
 */
export function countCertificates(pem: Buffer): number {
    return pem.toString('utf-8').split('-----BEGIN CERTIFICATE-----').length - 1;
}

/**
 * OpenSSL / Node reasons that mean "the peer's certificate was not trusted",
 * as opposed to a genuinely unreachable server. gRPC surfaces these inside an
 * UNAVAILABLE error's `details` string.
 */
const CERT_ERROR_PATTERNS = [
    'unable to verify the first certificate',
    'unable to get local issuer certificate',
    'self signed certificate',
    'self-signed certificate',
    'certificate has expired',
    'certificate verify failed',
    'CERT_UNTRUSTED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID'
];

/**
 * If the given error text looks like a certificate rejection, return actionable
 * advice; otherwise return an empty string.
 *
 * Certificate failures reach the user as a bare gRPC UNAVAILABLE, which reads
 * as "the server is down" and sends people looking in the wrong place.
 */
export function describeCertificateError(details: string, configuredCertPath?: string): string {
    if (!details) {
        return '';
    }
    const lowered = details.toLowerCase();
    const isCertError = CERT_ERROR_PATTERNS.some(p => lowered.includes(p.toLowerCase()));
    if (!isCertError) {
        return '';
    }

    if (configuredCertPath) {
        return ' The server certificate was rejected even though ' +
            `"armada.caCertPath" is set to ${resolveCertPath(configuredCertPath)}. ` +
            'Check that this bundle contains the CA that signed the server certificate ' +
            '(and the full intermediate chain).';
    }

    return ' This looks like a TLS certificate that the default trust store does not ' +
        'recognise, which is typical of a corporate TLS-inspecting proxy (Zscaler, ' +
        'Netskope, a company CA). Export your organisation\'s CA bundle as PEM and set ' +
        'the "armada.caCertPath" setting to it.';
}

/**
 * Append a PEM bundle to Node's built-in root certificates.
 *
 * Both `grpc.credentials.createSsl(rootCerts)` and the `ca` option on
 * `https.Agent` *replace* the trust store rather than adding to it. Handing
 * either one a corporate bundle alone would make the proxied endpoint work
 * while breaking every publicly-signed one — the same trap as setting
 * `SSL_CERT_FILE` instead of `NODE_EXTRA_CA_CERTS`. Concatenating with
 * `tls.rootCertificates` keeps both working.
 */
export function withSystemRoots(extraCerts: Buffer): Buffer {
    const systemRoots = tls.rootCertificates.join('\n');
    return Buffer.concat([
        Buffer.from(systemRoots, 'utf-8'),
        Buffer.from('\n', 'utf-8'),
        extraCerts
    ]);
}

/**
 * Resolve the configured CA path into a bundle ready to hand to gRPC or
 * `https.Agent`, with Node's roots retained.
 *
 * Returns undefined when nothing is configured, which leaves the default trust
 * store in place.
 */
export function buildTrustStore(certPath: string | undefined): Buffer | undefined {
    const extraCerts = loadCaCerts(certPath);
    return extraCerts ? withSystemRoots(extraCerts) : undefined;
}
