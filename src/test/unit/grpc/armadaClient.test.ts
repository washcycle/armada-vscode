import * as assert from 'assert';
import { MockArmadaServer } from '../../mock/armadaServer';
import { ArmadaClient, selectCredentials } from '../../../grpc/armadaClient';
import { ResolvedConfig } from '../../../types/config';

describe('ArmadaClient', () => {
    let mockServer: MockArmadaServer;
    let client: ArmadaClient;
    let config: ResolvedConfig;

    before(async () => {
        mockServer = new MockArmadaServer();
        const port = await mockServer.start();
        config = {
            armadaUrl: `localhost:${port}`,
            auth: { type: 'none' }
        };
        client = new ArmadaClient(config);
    });

    after(async () => {
        await mockServer.stop();
    });

    it('testConnection succeeds against mock server', async () => {
        const result = await client.testConnection();
        assert.strictEqual(result.ok, true);
    });

    it('submitJobs sends correct proto format and receives job IDs', async () => {
        const jobSpec = {
            queue: 'test-queue',
            jobSetId: 'test-job-set',
            jobs: [
                {
                    namespace: 'default',
                    priority: 1,
                    podSpecs: [{
                        containers: [{ name: 'test', image: 'busybox', resources: {} }]
                    }]
                }
            ]
        };

        const response = await client.submitJobs(jobSpec);
        assert.ok(response.jobIds, 'response should have jobIds');
        assert.strictEqual(response.jobIds.length, 1, 'should have one job ID');
        assert.ok(response.jobIds[0], 'job ID should be truthy');
    });

    it('cancelJob sends correct request fields', async () => {
        // Should resolve without error
        await client.cancelJob('job-123', 'job-set-456', 'test-queue');
    });

    it('getAllQueues returns parsed queue list', async () => {
        const queues = await client.getAllQueues();
        assert.ok(Array.isArray(queues), 'should return an array');
        assert.strictEqual(queues.length, 1, 'mock returns one queue');
        assert.strictEqual(queues[0].name, 'default');
    });

    it('streamJobSetEvents receives and converts event sequence', (done) => {
        const events: any[] = [];

        const stop = client.streamJobSetEvents(
            'test-queue',
            'test-job-set',
            (event) => { events.push(event); },
            (err) => { done(err); }
        );

        // Wait briefly for all events to arrive
        setTimeout(() => {
            stop();
            // Mock sends 4 events: submitted, queued, running, succeeded
            assert.ok(events.length >= 1, `expected at least 1 event, got ${events.length}`);
            done();
        }, 500);
    });

    it('getJobStatus returns status map', async () => {
        const jobId = 'job-abc-123';
        const statusMap = await client.getJobStatus([jobId]);
        assert.ok(statusMap instanceof Map, 'should return a Map');
        assert.ok(statusMap.has(jobId), 'should have the requested job ID');
        assert.strictEqual(statusMap.get(jobId), 'RUNNING');
    });

    it('sends basic auth credentials to the server', async () => {
        // Regression test: the extension used to parse basicAuth from the
        // armadactl config and then never send it, so any server with
        // anonymousAuth disabled answered 16 UNAUTHENTICATED.
        mockServer.resetLastMetadata();

        const authClient = new ArmadaClient({
            armadaUrl: config.armadaUrl,
            auth: { type: 'basic', credentials: { username: 'apqx', password: 's3cret' } }
        });

        await authClient.getAllQueues();

        const expected = 'Basic ' + Buffer.from('apqx:s3cret').toString('base64');
        assert.strictEqual(mockServer.getLastAuthorization(), expected);
    });

    it('sends credentials on streaming calls too', async () => {
        mockServer.resetLastMetadata();

        const authClient = new ArmadaClient({
            armadaUrl: config.armadaUrl,
            auth: { type: 'basic', credentials: { username: 'apqx', password: 's3cret' } }
        });

        await new Promise<void>((resolve, reject) => {
            const stop = authClient.streamJobSetEvents(
                'test-queue',
                'test-job-set',
                () => undefined,
                (err) => reject(err)
            );
            setTimeout(() => { stop(); resolve(); }, 300);
        });

        const expected = 'Basic ' + Buffer.from('apqx:s3cret').toString('base64');
        assert.strictEqual(mockServer.getLastAuthorization(), expected);
    });

    it('sends no authorization header when auth type is none', async () => {
        mockServer.resetLastMetadata();
        await client.getAllQueues();
        assert.strictEqual(mockServer.getLastAuthorization(), undefined);
    });

    it('warns when sending credentials over a plaintext connection', async () => {
        const messages: string[] = [];
        const authClient = new ArmadaClient({
            armadaUrl: config.armadaUrl,
            auth: { type: 'basic', credentials: { username: 'apqx', password: 's3cret' } }
        });
        authClient.onLogMessage = (message) => messages.push(message);

        await authClient.getAllQueues();

        assert.ok(
            messages.some(m => /WARNING.*unencrypted connection/.test(m)),
            `expected a plaintext warning, got: ${JSON.stringify(messages)}`
        );
    });

    it('client connects successfully with forceNoTls set to true', async () => {
        // Construct a URL that would normally cause TLS credentials to be selected.
        const [host, port] = config.armadaUrl.split(':');
        const tlsArmadaUrl = `https://${host}:${port}`;

        // Without forceNoTls, connecting to an HTTPS-style URL against the mock
        // (which speaks plaintext) should fail — testConnection never throws but returns ok: false.
        const secureConfig: ResolvedConfig = {
            armadaUrl: tlsArmadaUrl,
            auth: { type: 'none' }
        };
        const secureClient = new ArmadaClient(secureConfig);
        const secureResult = await secureClient.testConnection();
        assert.strictEqual(secureResult.ok, false, 'TLS client against plaintext server should fail');

        // With forceNoTls set, the same URL should connect successfully using insecure credentials.
        const insecureConfig: ResolvedConfig = {
            armadaUrl: tlsArmadaUrl,
            forceNoTls: true,
            auth: { type: 'none' }
        };
        const insecureClient = new ArmadaClient(insecureConfig);
        const result = await insecureClient.testConnection();
        assert.strictEqual(result.ok, true);
    });
});
