/**
 * Real gRPC / HTTP fixture servers for connection tests.
 *
 * Everything binds to ephemeral (non-default) ports. gRPC servers bind `[::]`
 * (dual-stack) so both 127.0.0.1 and ::1 targets work, falling back to
 * 127.0.0.1 where IPv6 is unavailable.
 *
 * Binoculars servers are placed at armadaPort + 2 so the client's port
 * derivation can be exercised.
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as path from 'path';
import { tlsFixture } from '../setup/tlsFixture';

// out/test/unit/support -> out/grpc/proto
const PROTO_ROOT = path.resolve(__dirname, '../../../grpc/proto');
const PROTO_OPTIONS: protoLoader.Options = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [PROTO_ROOT] };
const load = (file: string) => grpc.loadPackageDefinition(protoLoader.loadSync(path.join(PROTO_ROOT, file), PROTO_OPTIONS)) as any;

/** Non-ASCII payload used to detect UTF-8 corruption across chunk boundaries. */
export const UNICODE_OWNER = 'ü-öwner-日本語';

export function armadaService(tag: string, metadataLog: grpc.Metadata[] = []): grpc.Server {
    const server = new grpc.Server();
    const submit = load('pkg/api/submit.proto');
    const event = load('pkg/api/event.proto');
    const job = load('pkg/api/job.proto');
    const ok = (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, {});
    server.addService(submit.api.Submit.service, {
        SubmitJobs: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { job_response_items: [] }),
        CancelJobs: ok, GetQueue: ok, CreateQueue: ok, UpdateQueue: ok, DeleteQueue: ok, CancelJobSet: ok,
        ReprioritizeJobs: ok, Health: ok, PreemptJobs: ok, CreateQueues: ok, UpdateQueues: ok,
        CordonQueue: ok, UncordonQueue: ok,
        GetQueues: (call: grpc.ServerWritableStream<unknown, unknown>) => call.end(),
    });
    server.addService(event.api.Event.service, {
        GetJobSetEvents: (call: grpc.ServerWritableStream<unknown, unknown>) => call.end(),
        Watch: (call: grpc.ServerWritableStream<unknown, unknown>) => call.end(),
        Health: ok,
    });
    server.addService(job.api.Jobs.service, {
        GetJobStatus: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { job_states: {} }),
        // Cluster id is encoded in the job id as "job@<cluster>" so tests control Binoculars routing.
        GetJobDetails: (call: grpc.ServerUnaryCall<any, unknown>, cb: grpc.sendUnaryData<unknown>) => {
            const details: Record<string, unknown> = {};
            for (const id of call.request.job_ids as string[]) {
                details[id] = { job_id: id, job_runs: [{ cluster: id.split('@')[1] ?? '' }] };
            }
            cb(null, { job_details: details });
        },
        GetJobErrors: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { job_errors: {} }),
        GetJobStatusUsingExternalJobUri: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { job_states: {} }),
        GetJobRunDetails: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { job_run_details: {} }),
        GetActiveQueues: (call: grpc.ServerUnaryCall<unknown, unknown>, cb: grpc.sendUnaryData<unknown>) => {
            metadataLog.push(call.metadata);
            cb(null, { active_queues_by_pool: { [tag]: { queues: ['q1', 'q2'] } } });
        },
    });
    return server;
}

export function binocularsService(tag: string): grpc.Server {
    const server = new grpc.Server();
    const b = load('pkg/api/binoculars/binoculars.proto');
    server.addService(b.binoculars.Binoculars.service, {
        Logs: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, { log: [{ timestamp: 't', line: `served-by:${tag}` }] }),
        Cordon: (_c: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, {}),
    });
    return server;
}

function bind(server: grpc.Server, host: string, port: number, creds: grpc.ServerCredentials): Promise<number> {
    return new Promise((resolve, reject) => server.bindAsync(`${host}:${port}`, creds, (err, p) => (err ? reject(err) : resolve(p))));
}

export interface GrpcPair {
    armadaPort: number;
    binocularsPort: number;
    ipv6: boolean;
    /** Request metadata seen by the Armada server's GetActiveQueues. */
    metadata: grpc.Metadata[];
    stop(): void;
}

/**
 * Start an Armada server and a Binoculars server at armadaPort + 2.
 * Retries with fresh ports if +2 is taken.
 */
export async function startGrpcPair(secure: boolean, tag: string): Promise<GrpcPair> {
    const creds = () => (secure && tlsFixture)
        ? grpc.ServerCredentials.createSsl(null, [{ private_key: tlsFixture.key, cert_chain: tlsFixture.cert }], false)
        : grpc.ServerCredentials.createInsecure();

    for (let attempt = 0; attempt < 10; attempt++) {
        const metadata: grpc.Metadata[] = [];
        const armada = armadaService(tag, metadata);
        const binoculars = binocularsService(`binoculars-${tag}`);
        let host = '[::]';
        let armadaPort: number;
        try {
            armadaPort = await bind(armada, host, 0, creds());
        } catch {
            host = '127.0.0.1';
            armadaPort = await bind(armada, host, 0, creds());
        }
        try {
            const binocularsPort = await bind(binoculars, host, armadaPort + 2, creds());
            return {
                armadaPort, binocularsPort, ipv6: host === '[::]', metadata,
                stop: () => { armada.forceShutdown(); binoculars.forceShutdown(); },
            };
        } catch {
            armada.forceShutdown();
            binoculars.forceShutdown();
        }
    }
    throw new Error('Could not find a free port pair (p, p+2) for Armada/Binoculars fixtures');
}

export interface HttpFixture {
    port: number;
    stop(): Promise<void>;
}

function listen(server: http.Server | https.Server | net.Server): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '::', () => resolve((server.address() as net.AddressInfo).port));
    }).catch(() => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))));
}

function closer(server: http.Server | https.Server | net.Server): () => Promise<void> {
    const sockets = new Set<net.Socket>();
    server.on('connection', (s: net.Socket) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    return () => new Promise(resolve => { sockets.forEach(s => s.destroy()); server.close(() => resolve()); });
}

/**
 * Lookout-like JSON API. Echoes the request path in `jobSet` and streams the
 * body one byte at a time so multi-byte UTF-8 characters split across chunks.
 */
export async function startLookout(secure: boolean): Promise<HttpFixture> {
    const handler: http.RequestListener = (req, res) => {
        req.resume();
        req.on('end', () => {
            const payload = Buffer.from(JSON.stringify({
                jobs: [{ jobId: 'j1', jobSet: `path:${req.url}`, queue: 'q', state: 'RUNNING', owner: UNICODE_OWNER }],
            }));
            res.writeHead(200, { 'content-type': 'application/json' });
            let i = 0;
            const writeNext = () => {
                if (i >= payload.length) { res.end(); return; }
                res.write(payload.subarray(i, i + 1));
                i++;
                setImmediate(writeNext);
            };
            writeNext();
        });
    };
    const server = secure && tlsFixture
        ? https.createServer({ key: tlsFixture.key, cert: tlsFixture.cert }, handler)
        : http.createServer(handler);
    const stop = closer(server);
    return { port: await listen(server), stop };
}

/** HTTP server that always returns a reverse-proxy style 502 HTML page. */
export async function startBadGateway(): Promise<HttpFixture> {
    const server = http.createServer((_req, res) => { res.writeHead(502, { 'content-type': 'text/html' }); res.end('<html><body>502 Bad Gateway</body></html>'); });
    const stop = closer(server);
    return { port: await listen(server), stop };
}

/**
 * TCP server that accepts connections and never responds. Deterministically
 * reproduces a firewalled / hung endpoint without depending on the network.
 */
export async function startSilentTcp(): Promise<HttpFixture> {
    const server = net.createServer(() => { /* accept and say nothing */ });
    const stop = closer(server);
    return { port: await listen(server), stop };
}
