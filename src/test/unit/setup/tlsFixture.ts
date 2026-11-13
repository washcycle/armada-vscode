/**
 * Mocha `--require` setup: creates a throwaway self-signed localhost certificate
 * and trusts it for gRPC and https before any test module loads @grpc/grpc-js.
 *
 * grpc-js reads GRPC_DEFAULT_SSL_ROOTS_FILE_PATH once, at module load, so this
 * must run before any test file is required. If openssl is unavailable the
 * TLS-dependent tests skip themselves (see `tlsFixture` below).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';

export interface TlsFixture {
    key: Buffer;
    cert: Buffer;
    certPath: string;
}

function createFixture(): TlsFixture | null {
    try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-test-tls-'));
        const keyPath = path.join(dir, 'key.pem');
        const certPath = path.join(dir, 'cert.pem');
        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', keyPath, '-out', certPath, '-days', '1',
            '-subj', '/CN=localhost',
            '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
        ], { stdio: 'ignore' });
        process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
        return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), certPath };
    } catch {
        return null;
    }
}

export const tlsFixture: TlsFixture | null = createFixture();

if (tlsFixture) {
    // gRPC: default roots used by grpc.credentials.createSsl() with no args
    process.env.GRPC_DEFAULT_SSL_ROOTS_FILE_PATH = tlsFixture.certPath;
    // https: LookoutClient uses the global agent; trust the fixture CA alongside the system roots
    https.globalAgent.options.ca = [...tls.rootCertificates, tlsFixture.cert.toString()];
}
