import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SelfSignedCert {
    key: Buffer;
    cert: Buffer;
    /** Directory holding the generated files; remove it when done. */
    dir: string;
}

/**
 * True when `openssl` is available to generate a throwaway certificate.
 * Tests that need a real TLS handshake skip themselves when it is not.
 */
export function opensslAvailable(): boolean {
    try {
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate a short-lived self-signed certificate for localhost in a temp dir.
 *
 * Generated per run rather than committed: a checked-in private key trips
 * secret scanners and eventually expires. This is throwaway test-only material.
 */
export function generateSelfSignedCert(): SelfSignedCert {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-tls-'));
    const keyPath = path.join(dir, 'server.key');
    const certPath = path.join(dir, 'server.crt');

    execFileSync('openssl', [
        'req', '-x509',
        '-newkey', 'rsa:2048',
        '-nodes',
        '-keyout', keyPath,
        '-out', certPath,
        '-days', '1',
        '-subj', '/CN=localhost',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ], { stdio: 'ignore' });

    return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        dir
    };
}

export function cleanupSelfSignedCert(generated: SelfSignedCert): void {
    fs.rmSync(generated.dir, { recursive: true, force: true });
}
