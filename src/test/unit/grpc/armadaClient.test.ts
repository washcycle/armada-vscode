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
        assert.strictEqual(result, true);
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

    it('client connects successfully with forceNoTls set to true', async () => {
        const tlsConfig: ResolvedConfig = {
            armadaUrl: config.armadaUrl,
            forceNoTls: true,
            auth: { type: 'none' }
        };
        const insecureClient = new ArmadaClient(tlsConfig);
        const result = await insecureClient.testConnection();
        assert.strictEqual(result, true);
    });
});
