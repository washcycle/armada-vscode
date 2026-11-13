import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import {
    buildTrustStore,
    CaCertError,
    certificatesNotIn,
    defaultRoots,
    resolveTrustStore,
    countCertificates,
    describeCertificateError,
    loadCaCerts,
    resolveCertPath,
    withSystemRoots
} from '../../../grpc/caCerts';
import { cleanupSelfSignedCert, generateSelfSignedCert, opensslAvailable } from '../../mock/selfSignedCert';

/** A syntactically well-formed PEM block; contents are never parsed by these tests. */
const FAKE_PEM = [
    '-----BEGIN CERTIFICATE-----',
    'MIIBfakecertificatecontentsthatarenotparsedbythesetests',
    '-----END CERTIFICATE-----',
    ''
].join('\n');

describe('resolveCertPath', () => {
    it('expands a leading tilde to the home directory', () => {
        assert.strictEqual(
            resolveCertPath('~/certs/corp.pem'),
            path.join(os.homedir(), 'certs/corp.pem')
        );
    });

    it('leaves an absolute path alone', () => {
        assert.strictEqual(resolveCertPath('/etc/ssl/certs/corp.pem'), '/etc/ssl/certs/corp.pem');
    });

    it('makes a relative path absolute', () => {
        assert.ok(path.isAbsolute(resolveCertPath('corp.pem')));
    });
});

describe('loadCaCerts', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-ca-test-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns undefined when no path is configured', () => {
        assert.strictEqual(loadCaCerts(undefined), undefined);
        assert.strictEqual(loadCaCerts(''), undefined);
        assert.strictEqual(loadCaCerts('   '), undefined);
    });

    it('reads a PEM bundle from disk', () => {
        const certPath = path.join(tmpDir, 'good.pem');
        fs.writeFileSync(certPath, FAKE_PEM);
        const loaded = loadCaCerts(certPath);
        assert.ok(loaded);
        assert.ok(loaded.toString('utf-8').includes('-----BEGIN CERTIFICATE-----'));
    });

    it('throws a CaCertError naming the file when it does not exist', () => {
        const missing = path.join(tmpDir, 'nope.pem');
        assert.throws(
            () => loadCaCerts(missing),
            (error: Error) => {
                assert.ok(error instanceof CaCertError);
                assert.match(error.message, /file not found/);
                assert.ok(error.message.includes(missing), 'message should name the path');
                return true;
            }
        );
    });

    it('rejects a file that is not PEM, pointing at the DER conversion', () => {
        // A DER-encoded .crt is the most common wrong-format mistake, and
        // handing its bytes to gRPC fails with an opaque error.
        const derPath = path.join(tmpDir, 'corp.crt');
        fs.writeFileSync(derPath, Buffer.from([0x30, 0x82, 0x01, 0x0a, 0x02, 0x01]));
        assert.throws(
            () => loadCaCerts(derPath),
            (error: Error) => {
                assert.ok(error instanceof CaCertError);
                assert.match(error.message, /does not look like a PEM certificate bundle/);
                assert.match(error.message, /openssl x509 -inform der/);
                return true;
            }
        );
    });
});

describe('withSystemRoots', () => {
    it('keeps the system roots and appends the extra certificates', () => {
        // Replacing rather than appending is the classic mistake here — it makes
        // the proxied endpoint work while breaking every public CA.
        const combined = withSystemRoots(Buffer.from(FAKE_PEM), tls.rootCertificates as string[]);
        assert.strictEqual(
            countCertificates(combined),
            tls.rootCertificates.length + 1,
            'combined bundle should hold every system root plus the extra cert'
        );
    });
});

describe('buildTrustStore', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-ca-store-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns undefined when nothing is configured, leaving defaults in place', () => {
        assert.strictEqual(buildTrustStore(undefined, { systemCertificates: () => [] }), undefined);
        assert.strictEqual(buildTrustStore(undefined, { useSystemCertificates: false }), undefined);
    });

    it('returns system roots plus the configured bundle', () => {
        const certPath = path.join(tmpDir, 'corp.pem');
        fs.writeFileSync(certPath, FAKE_PEM);
        const store = buildTrustStore(certPath, { useSystemCertificates: false });
        assert.ok(store);
        assert.strictEqual(countCertificates(store), defaultRootCount() + 1);
    });

    // A real root re-wrapped at 76 columns, as OS stores often export it.
    const rewrap = (pem: string) => {
        const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
        return ['-----BEGIN CERTIFICATE-----', ...(body.match(/.{1,76}/g) ?? []), '-----END CERTIFICATE-----'].join('\n');
    };
    const defaultRootCount = () => countCertificates(Buffer.from(defaultRoots().join('\n')));

    it('adds OS certificates that the default roots lack', function () {
        if (!opensslAvailable()) { this.skip(); }
        this.timeout(30_000);
        const corp = generateSelfSignedCert();
        try {
            const result = resolveTrustStore(undefined, { systemCertificates: () => [corp.cert.toString()] });
            assert.strictEqual(result.systemCount, 1);
            assert.strictEqual(result.fileCount, 0);
            assert.strictEqual(countCertificates(result.bundle!), defaultRootCount() + 1);
        } finally {
            cleanupSelfSignedCert(corp);
        }
    });

    it('leaves the defaults alone when the OS store adds nothing new', () => {
        const os = tls.rootCertificates.slice(0, 5).map(rewrap);
        const result = resolveTrustStore(undefined, { systemCertificates: () => os });
        assert.strictEqual(result.systemCount, 0, 'differently wrapped copies of bundled roots are not new');
        assert.strictEqual(result.bundle, undefined);
    });

    it('skips OS certificates when disabled', () => {
        let read = false;
        const result = resolveTrustStore(undefined, {
            useSystemCertificates: false,
            systemCertificates: () => { read = true; return []; }
        });
        assert.strictEqual(read, false, 'the OS store is not even read');
        assert.strictEqual(result.bundle, undefined);
    });

    it('drops unparseable and already-trusted OS entries but keeps caCertPath', () => {
        const certPath = path.join(tmpDir, 'corp2.pem');
        fs.writeFileSync(certPath, FAKE_PEM);
        const result = resolveTrustStore(certPath, {
            systemCertificates: () => [FAKE_PEM, rewrap(tls.rootCertificates[0])]
        });
        assert.strictEqual(result.fileCount, 1);
        assert.strictEqual(result.systemCount, 0, 'unparseable and already-trusted OS entries are dropped');
        assert.strictEqual(countCertificates(result.bundle!), defaultRootCount() + 1);
    });
});

describe('certificatesNotIn', () => {
    it('compares by fingerprint and drops duplicates within the candidates', () => {
        const [a, b] = tls.rootCertificates;
        assert.deepStrictEqual(certificatesNotIn([a, b, b], [a]), [b]);
    });
});

describe('describeCertificateError', () => {
    it('returns nothing for an unrelated error', () => {
        assert.strictEqual(describeCertificateError('connection refused'), '');
    });

    it('returns nothing for empty details', () => {
        assert.strictEqual(describeCertificateError(''), '');
    });

    it('suggests caCertPath when a cert is untrusted and none is configured', () => {
        const hint = describeCertificateError('unable to verify the first certificate');
        assert.match(hint, /armada\.caCertPath/);
        assert.match(hint, /proxy/i);
    });

    it('recognises a self-signed certificate', () => {
        assert.match(describeCertificateError('self signed certificate in certificate chain'), /caCertPath/);
    });

    it('recognises an expired certificate', () => {
        assert.match(describeCertificateError('certificate has expired'), /caCertPath/);
    });

    it('is case-insensitive', () => {
        assert.match(describeCertificateError('UNABLE TO GET LOCAL ISSUER CERTIFICATE'), /caCertPath/);
    });

    it('says the configured bundle did not match when one is already set', () => {
        const hint = describeCertificateError('unable to verify the first certificate', '/tmp/corp.pem');
        assert.match(hint, /\/tmp\/corp\.pem/);
        assert.match(hint, /intermediate chain/);
    });
});
