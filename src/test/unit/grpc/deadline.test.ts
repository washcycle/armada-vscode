import * as assert from 'assert';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { makeDeadlineInterceptor, describeTimeout, DEADLINE_EXCEEDED } from '../../../grpc/deadline';
import { startGrpcPair, startSilentTcp, GrpcPair, HttpFixture } from '../support/connectionFixtures';
import { within } from '../support/knownBug';

const PROTO_ROOT = path.resolve(__dirname, '../../../grpc/proto');
const OPTS: protoLoader.Options = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [PROTO_ROOT] };
const load = (f: string) => grpc.loadPackageDefinition(protoLoader.loadSync(path.join(PROTO_ROOT, f), OPTS)) as any;

function unaryCall(client: any, options?: grpc.CallOptions): Promise<{ code?: number; elapsed: number }> {
    const started = Date.now();
    return new Promise(resolve => {
        const cb = (err: grpc.ServiceError | null) => resolve({ code: err?.code, elapsed: Date.now() - started });
        if (options) { client.GetActiveQueues({}, options, cb); } else { client.GetActiveQueues({}, cb); }
    });
}

describe('makeDeadlineInterceptor', function () {
    this.timeout(15000);

    const job = load('pkg/api/job.proto');
    const event = load('pkg/api/event.proto');
    let silent: HttpFixture;
    let live: GrpcPair;

    before(async () => {
        silent = await startSilentTcp();
        live = await startGrpcPair(false, 'deadline');
    });

    after(async () => {
        await silent.stop();
        live.stop();
    });

    it('fails a unary call to an unresponsive host with DEADLINE_EXCEEDED', async () => {
        const client = new job.api.Jobs(`127.0.0.1:${silent.port}`, grpc.credentials.createInsecure(), {
            interceptors: [makeDeadlineInterceptor(500)],
        });
        const r = await within(unaryCall(client), 5000, 'unary call');
        client.close();
        assert.strictEqual(r.code, DEADLINE_EXCEEDED);
        assert.ok(r.elapsed >= 400 && r.elapsed < 3000, `elapsed ${r.elapsed}ms`);
    });

    it('does not override a deadline the caller set', async () => {
        const client = new job.api.Jobs(`127.0.0.1:${silent.port}`, grpc.credentials.createInsecure(), {
            interceptors: [makeDeadlineInterceptor(5000)],
        });
        const r = await within(unaryCall(client, { deadline: Date.now() + 300 }), 4000, 'unary call');
        client.close();
        assert.strictEqual(r.code, DEADLINE_EXCEEDED);
        assert.ok(r.elapsed < 2000, `caller's 300ms deadline should win, took ${r.elapsed}ms`);
    });

    it('lets healthy unary calls succeed', async () => {
        const client = new job.api.Jobs(`localhost:${live.armadaPort}`, grpc.credentials.createInsecure(), {
            interceptors: [makeDeadlineInterceptor(2000)],
        });
        const r = await unaryCall(client);
        client.close();
        assert.strictEqual(r.code, undefined);
    });

    it('leaves server streams open past the unary deadline', async () => {
        const client = new event.api.Event(`localhost:${live.armadaPort}`, grpc.credentials.createInsecure(), {
            interceptors: [makeDeadlineInterceptor(200)],
        });
        let error: grpc.ServiceError | undefined;
        const stream = client.GetJobSetEvents({ queue: 'q', id: 'deadline-stream', watch: true });
        stream.on('error', (e: grpc.ServiceError) => { error = e; });
        await new Promise(r => setTimeout(r, 800));
        assert.strictEqual(error, undefined, `stream was cut: ${error?.message}`);
        assert.ok(live.events.some(e => e.jobSetId === 'deadline-stream' && !e.cancelled), 'server still has the stream open');
        stream.cancel();
        client.close();
    });
});

describe('describeTimeout', () => {
    it('names the endpoint, the timeout and the likely causes', () => {
        const msg = describeTimeout('armada.example.com:50051', 10_000);
        assert.match(msg, /10s/);
        assert.match(msg, /armada\.example\.com:50051/);
        assert.match(msg, /firewall/);
        assert.match(msg, /forceNoTls/);
    });
});
