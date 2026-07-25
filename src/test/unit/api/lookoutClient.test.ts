import * as assert from 'assert';
import * as https from 'https';
import { AddressInfo } from 'net';
import { LookoutClient, LookoutJobsRequest } from '../../../api/lookoutClient';
import {
    cleanupSelfSignedCert,
    generateSelfSignedCert,
    opensslAvailable,
    SelfSignedCert
} from '../../mock/selfSignedCert';

/** Minimal well-formed request; the stub server ignores the body. */
const REQUEST: LookoutJobsRequest = {
    filters: [],
    order: { field: 'jobId', direction: 'ASC' },
    take: 10
};

/**
 * The Lookout client talks HTTPS rather than gRPC, so it needs its own trust
 * store wiring. These tests use a real self-signed HTTPS server: the same
 * request must fail with the default roots and succeed once the CA is supplied.
 */
describe('LookoutClient TLS trust', function () {
    let generated: SelfSignedCert | undefined;
    let server: https.Server | undefined;
    let lookoutUrl: string;

    before(function (done) {
        if (!opensslAvailable()) {
            // Nothing to assert without a certificate to serve.
            this.skip();
            return;
        }
        this.timeout(30_000);

        generated = generateSelfSignedCert();
        server = https.createServer(
            { key: generated.key, cert: generated.cert },
            (_req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jobs: [] }));
            }
        );
        server.listen(0, '127.0.0.1', () => {
            const { port } = server!.address() as AddressInfo;
            lookoutUrl = `https://localhost:${port}`;
            done();
        });
    });

    after(function (done) {
        const finish = () => {
            if (generated) { cleanupSelfSignedCert(generated); }
            done();
        };
        if (server) { server.close(finish); } else { finish(); }
    });

    it('rejects a self-signed server when the CA is not trusted', async function () {
        this.timeout(30_000);
        const client = new LookoutClient({ lookoutUrl });
        await assert.rejects(
            () => client.getJobs(REQUEST),
            (error: Error) => {
                assert.match(error.message, /certificate/i);
                return true;
            }
        );
    });

    it('succeeds once the signing certificate is trusted', async function () {
        this.timeout(30_000);
        const client = new LookoutClient({
            lookoutUrl,
            caCerts: Buffer.from(generated!.cert)
        });
        const jobs = await client.getJobs(REQUEST);
        assert.deepStrictEqual(jobs, []);
    });

    it('suggests caCertPath when a certificate is rejected and none is set', async function () {
        this.timeout(30_000);
        const client = new LookoutClient({ lookoutUrl });
        await assert.rejects(
            () => client.getJobs(REQUEST),
            (error: Error) => {
                assert.match(error.message, /caCertPath/);
                return true;
            }
        );
    });

    it('does not blame a bundle that never loaded', async function () {
        this.timeout(30_000);
        // caCertPath is set but caCerts is absent, i.e. the bundle failed to
        // load. Saying "your bundle lacks the signing CA" would point the user
        // at a file that was never read.
        const client = new LookoutClient({
            lookoutUrl,
            caCertPath: '/nonexistent/corp.pem'
        });
        await assert.rejects(
            () => client.getJobs(REQUEST),
            (error: Error) => {
                assert.doesNotMatch(error.message, /rejected even though/);
                assert.match(error.message, /caCertPath/);
                return true;
            }
        );
    });
});
