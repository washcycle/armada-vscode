import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MockArmadaServer } from '../../mock/armadaServer';
import { ArmadaClient } from '../../../grpc/armadaClient';
import {
    certificatesNotIn,
    countCertificates,
    defaultRoots,
    readSystemCertificates,
    setSystemCertificatesForTesting
} from '../../../grpc/caCerts';
import {
    cleanupSelfSignedCert,
    generateSelfSignedCert,
    opensslAvailable,
    SelfSignedCert
} from '../../mock/selfSignedCert';

/**
 * End-to-end proof that `armada.caCertPath` changes the outcome of a real TLS
 * handshake: the same server is unreachable with the default trust store and
 * reachable once its CA is trusted.
 *
 * This is the scenario behind the setting — a corporate TLS-inspecting proxy
 * presents a certificate signed by a CA that Node does not ship.
 */
describe('TLS trust via caCertPath', function () {
    let generated: SelfSignedCert | undefined;
    let server: MockArmadaServer | undefined;
    let armadaUrl: string;
    let certPath: string;

    before(async function () {
        if (!opensslAvailable()) {
            // Nothing to assert without a certificate to serve.
            this.skip();
        }
        // Key generation plus two handshakes can exceed mocha's 2s default.
        this.timeout(30_000);

        generated = generateSelfSignedCert();
        certPath = path.join(generated.dir, 'server.crt');
        fs.writeFileSync(certPath, generated.cert);

        server = new MockArmadaServer();
        const port = await server.start({ key: generated.key, cert: generated.cert });
        armadaUrl = `https://localhost:${port}`;
    });

    after(async function () {
        if (server) { await server.stop(); }
        if (generated) { cleanupSelfSignedCert(generated); }
    });

    it('fails against a self-signed server when the CA is not trusted', async function () {
        this.timeout(30_000);
        const client = new ArmadaClient({ armadaUrl, auth: { type: 'none' } });
        const result = await client.testConnection();
        assert.strictEqual(result.ok, false, 'untrusted certificate should not connect');
    });

    it('succeeds once caCertPath supplies the signing certificate', async function () {
        this.timeout(30_000);
        const client = new ArmadaClient({
            armadaUrl,
            caCertPath: certPath,
            auth: { type: 'none' }
        });
        const result = await client.testConnection();
        assert.strictEqual(
            result.ok,
            true,
            `expected a successful handshake with caCertPath set, got: ${result.message ?? '(no error)'}`
        );
    });

    it('reports a certificate error rather than a bare "is the server running?"', async function () {
        this.timeout(30_000);
        const messages: string[] = [];
        const client = new ArmadaClient({ armadaUrl, auth: { type: 'none' } });
        client.onLogMessage = (message) => messages.push(message);

        await client.testConnection();

        const joined = messages.join('\n');
        assert.match(joined, /caCertPath/, `expected caCertPath guidance, got: ${joined}`);
    });

    it('still trusts public CAs when an extra bundle is configured', async function () {
        this.timeout(30_000);
        // Regression guard: `createSsl(rootCerts)` replaces the trust store, so
        // a naive implementation would break every publicly-signed endpoint the
        // moment a corporate bundle is configured.
        const client = new ArmadaClient({
            armadaUrl,
            caCertPath: certPath,
            auth: { type: 'none' }
        });
        const store = (client as any).getTrustStore() as Buffer;
        const roots = defaultRoots();
        const expected = countCertificates(Buffer.from(roots.join('\n')))
            + certificatesNotIn(readSystemCertificates(), roots).length
            + 1;
        assert.strictEqual(countCertificates(store), expected);
    });

    it('falls back to default roots and logs when the bundle is missing', async function () {
        this.timeout(30_000);
        const messages: string[] = [];
        const client = new ArmadaClient({
            armadaUrl,
            caCertPath: path.join(generated!.dir, 'absent.pem'),
            auth: { type: 'none' }
        });
        client.onLogMessage = (message) => messages.push(message);

        // Should not throw; the client stays usable with the default store.
        const result = await client.testConnection();
        assert.strictEqual(result.ok, false);

        const joined = messages.join('\n');
        assert.match(joined, /file not found/);
        assert.match(joined, /absent\.pem/);
    });

    it('does not blame an unloadable bundle for the certificate rejection', async function () {
        this.timeout(30_000);
        // The bundle never loaded, so the default store is what rejected the
        // certificate. Claiming the configured bundle lacked the signing CA
        // would send the user auditing a file that was never read.
        const messages: string[] = [];
        const client = new ArmadaClient({
            armadaUrl,
            caCertPath: path.join(generated!.dir, 'absent.pem'),
            auth: { type: 'none' }
        });
        client.onLogMessage = (message) => messages.push(message);

        await client.testConnection();

        const joined = messages.join('\n');
        assert.doesNotMatch(
            joined,
            /rejected even though/,
            `should not claim the bundle is in effect, got: ${joined}`
        );
        // Still guides the user toward configuring a working bundle.
        assert.match(joined, /caCertPath/);
    });

    describe('via the operating system certificate store', () => {
        afterEach(() => setSystemCertificatesForTesting(undefined));

        it('connects with no caCertPath when IT installed the CA in the OS store', async function () {
            // The Zscaler / Netskope case: the proxy CA is in the Windows
            // store or macOS keychain, and nothing is configured in VS Code.
            this.timeout(30_000);
            setSystemCertificatesForTesting([generated!.cert.toString()]);
            const messages: string[] = [];
            const client = new ArmadaClient({ armadaUrl, auth: { type: 'none' } });
            client.onLogMessage = (message) => messages.push(message);

            const result = await client.testConnection();
            assert.strictEqual(result.ok, true, result.message ?? "");
            assert.match(messages.join('\n'), /1 CA certificate\(s\) from the operating system store/);
        });

        it('ignores the OS store when armada.useSystemCertificates is off', async function () {
            this.timeout(30_000);
            setSystemCertificatesForTesting([generated!.cert.toString()]);
            const client = new ArmadaClient({ armadaUrl, useSystemCertificates: false, auth: { type: 'none' } });
            const result = await client.testConnection();
            assert.strictEqual(result.ok, false, 'OS store must not be consulted when disabled');
        });

        it('keeps OS trust when a configured caCertPath cannot be read', async function () {
            this.timeout(30_000);
            setSystemCertificatesForTesting([generated!.cert.toString()]);
            const client = new ArmadaClient({
                armadaUrl,
                caCertPath: path.join(generated!.dir, 'absent.pem'),
                auth: { type: 'none' }
            });
            const result = await client.testConnection();
            assert.strictEqual(result.ok, true, result.message ?? "");
        });
    });
});
