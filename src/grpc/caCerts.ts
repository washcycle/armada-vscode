import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import { X509Certificate } from 'crypto';

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

    return ' This looks like a TLS certificate that neither the bundled roots nor the ' +
        'operating system trust store recognise, which is typical of a corporate ' +
        'TLS-inspecting proxy (Zscaler, Netskope, a company CA) whose CA is not installed ' +
        'in the OS store, or of "armada.useSystemCertificates" being off. Export your ' +
        'organisation\'s CA bundle as PEM and set the "armada.caCertPath" setting to it.';
}

/**
 * The roots the process would trust with no bundle supplied: Node's bundled
 * Mozilla store plus anything added via `NODE_EXTRA_CA_CERTS` (what
 * `tls.getCACertificates('default')` returns), plus the file named by
 * `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` when set. Any bundle we hand to gRPC or
 * `https.Agent` replaces the defaults, so it must start from all of these or
 * it would silently drop trust the user configured elsewhere.
 */
export function defaultRoots(): string[] {
    const getCACertificates = (tls as any).getCACertificates as ((type: string) => string[]) | undefined;
    let roots: string[];
    try {
        roots = typeof getCACertificates === 'function'
            ? [...getCACertificates('default')]
            : [...tls.rootCertificates];
    } catch {
        roots = [...tls.rootCertificates];
    }
    const grpcRootsFile = process.env.GRPC_DEFAULT_SSL_ROOTS_FILE_PATH;
    if (grpcRootsFile) {
        try {
            roots.push(fs.readFileSync(grpcRootsFile, 'utf-8'));
        } catch {
            // grpc-js reports an unreadable file itself; nothing to add here.
        }
    }
    return roots;
}

/**
 * Certificates in the operating system's trust store (Windows certificate
 * store, macOS keychain, the distro bundle on Linux).
 *
 * This is where corporate IT installs the CA for a TLS-inspecting proxy such
 * as Zscaler or Netskope, so trusting it makes those networks work with no
 * configuration. Needs `tls.getCACertificates('system')` (Node 22.15+ / 23.5+);
 * on older runtimes this returns an empty list and the extension behaves as
 * before. The result is cached: reading the store can take a moment on
 * Windows and macOS, and it does not change while VS Code is running.
 */
let systemCertsCache: string[] | undefined;
export function readSystemCertificates(): string[] {
    if (systemCertsCache) {
        return systemCertsCache;
    }
    const getCACertificates = (tls as any).getCACertificates as ((type: string) => string[]) | undefined;
    try {
        systemCertsCache = typeof getCACertificates === 'function' ? getCACertificates('system') : [];
    } catch {
        systemCertsCache = [];
    }
    return systemCertsCache;
}

/**
 * Replace the cached OS store contents. Tests use this to simulate a CA that
 * IT installed on the machine; `undefined` re-reads the real store.
 */
export function setSystemCertificatesForTesting(certs: string[] | undefined): void {
    systemCertsCache = certs;
}

function fingerprint(pem: string): string | undefined {
    try {
        return new X509Certificate(pem).fingerprint256;
    } catch {
        return undefined;
    }
}

/**
 * The certificates in `candidates` that are not already in `existing`.
 *
 * Compared by fingerprint, not text: the OS store and Node's bundle encode the
 * same root with different line wrapping, so a string comparison would treat
 * every OS root as new and always build a custom bundle.
 */
export function certificatesNotIn(candidates: string[], existing: string[]): string[] {
    const known = new Set(existing.map(fingerprint).filter(Boolean));
    const added = new Set<string>();
    return candidates.filter(pem => {
        const fp = fingerprint(pem);
        if (!fp || known.has(fp) || added.has(fp)) {
            return false;
        }
        added.add(fp);
        return true;
    });
}

/**
 * Append a PEM bundle to the default roots.
 *
 * Both `grpc.credentials.createSsl(rootCerts)` and the `ca` option on
 * `https.Agent` *replace* the trust store rather than adding to it. Handing
 * either one a corporate bundle alone would make the proxied endpoint work
 * while breaking every publicly-signed one — the same trap as setting
 * `SSL_CERT_FILE` instead of `NODE_EXTRA_CA_CERTS`. Concatenating with the
 * default roots keeps both working.
 */
export function withSystemRoots(extraCerts: Buffer, roots: string[] = defaultRoots()): Buffer {
    return Buffer.concat([
        Buffer.from(roots.join('\n'), 'utf-8'),
        Buffer.from('\n', 'utf-8'),
        extraCerts
    ]);
}

export interface TrustStoreOptions {
    /** Also trust the OS certificate store (the `armada.useSystemCertificates` setting). Default true. */
    useSystemCertificates?: boolean;
    /** Source of OS certificates; a seam for tests. */
    systemCertificates?: () => string[];
}

export interface TrustStore {
    /** Bundle to hand to gRPC or `https.Agent`, or undefined to keep the defaults. */
    bundle: Buffer | undefined;
    /** OS certificates added on top of the default roots. */
    systemCount: number;
    /** Certificates loaded from `caCertPath`. */
    fileCount: number;
}

/**
 * Work out what to trust: the default roots, plus OS certificates the
 * defaults lack (unless disabled), plus the configured `caCertPath` bundle.
 *
 * `bundle` is undefined when there is nothing beyond the defaults, which
 * leaves the default trust store in place. Throws CaCertError when a
 * configured `caCertPath` cannot be used.
 */
export function resolveTrustStore(certPath: string | undefined, options: TrustStoreOptions = {}): TrustStore {
    const fileCerts = loadCaCerts(certPath);
    const roots = defaultRoots();
    const systemCerts = options.useSystemCertificates === false
        ? []
        : certificatesNotIn((options.systemCertificates ?? readSystemCertificates)(), roots);

    if (!fileCerts && systemCerts.length === 0) {
        return { bundle: undefined, systemCount: 0, fileCount: 0 };
    }
    const extra = Buffer.concat([
        Buffer.from(systemCerts.join('\n'), 'utf-8'),
        Buffer.from('\n', 'utf-8'),
        fileCerts ?? Buffer.alloc(0)
    ]);
    return {
        bundle: withSystemRoots(extra, roots),
        systemCount: systemCerts.length,
        fileCount: fileCerts ? countCertificates(fileCerts) : 0
    };
}

/**
 * The bundle from `resolveTrustStore`, for callers that don't need the counts.
 */
export function buildTrustStore(certPath: string | undefined, options: TrustStoreOptions = {}): Buffer | undefined {
    return resolveTrustStore(certPath, options).bundle;
}
