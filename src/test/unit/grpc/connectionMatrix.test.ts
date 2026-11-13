/**
 * Connection matrix: real ArmadaClient against real gRPC servers on
 * non-default (ephemeral) ports, plaintext and TLS, IPv4 and IPv6.
 *
 * `knownBug()` cases document open issues: they pass while the bug exists and
 * fail once it's fixed, so the fix author converts them to regular tests.
 */
import * as assert from 'assert';
import * as grpc from '@grpc/grpc-js';
import { ArmadaClient, selectCredentials } from '../../../grpc/armadaClient';
import { ResolvedConfig } from '../../../types/config';
import { tlsFixture } from '../setup/tlsFixture';
import { startGrpcPair, startSilentTcp, GrpcPair, HttpFixture } from '../support/connectionFixtures';
import { knownBug, within } from '../support/knownBug';

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
    // ArmadaClient logs heavily via console.*; keep test output readable.
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = () => undefined;
    return fn().finally(() => Object.assign(console, saved));
};

function client(cfg: Partial<ResolvedConfig> & { armadaUrl: string }): ArmadaClient {
    return new ArmadaClient({ auth: { type: 'none' }, ...cfg } as ResolvedConfig);
}

async function expectConnects(cfg: Partial<ResolvedConfig> & { armadaUrl: string }): Promise<void> {
    const result = await quiet(() => within(client(cfg).testConnection(), 10000, `testConnection(${cfg.armadaUrl})`));
    assert.strictEqual(result.ok, true, `expected ${JSON.stringify(cfg.armadaUrl)} to connect: ${result.message}`);
    assert.match(result.detail ?? '', /2 active queues found/);
}

async function expectRejected(cfg: Partial<ResolvedConfig> & { armadaUrl: string }): Promise<void> {
    const result = await quiet(() => within(client(cfg).testConnection(), 10000, `testConnection(${cfg.armadaUrl})`));
    assert.strictEqual(result.ok, false, `expected ${JSON.stringify(cfg.armadaUrl)} NOT to connect`);
}

async function logsServedBy(cfg: Partial<ResolvedConfig> & { armadaUrl: string }, cluster: string): Promise<string> {
    const logs = await quiet(() => within(client(cfg).getJobLogs(`job@${cluster}`), 10000, 'getJobLogs'));
    return (logs[0]?.line ?? '').replace('served-by:', '');
}

const isSecure = (c: grpc.ChannelCredentials) => (c as unknown as { _isSecure(): boolean })._isSecure();

describe('Connection matrix (real gRPC, non-default ports)', function () {
    this.timeout(30000);

    let plain: GrpcPair;
    let secure: GrpcPair | undefined;

    before(async () => {
        plain = await startGrpcPair(false, 'plain');
        if (tlsFixture) { secure = await startGrpcPair(true, 'tls'); }
    });

    after(() => {
        plain?.stop();
        secure?.stop();
    });

    describe('armadaUrl forms → testConnection', () => {
        it('bare localhost:port', () => expectConnects({ armadaUrl: `localhost:${plain.armadaPort}` }));
        it('bare 127.0.0.1:port', () => expectConnects({ armadaUrl: `127.0.0.1:${plain.armadaPort}` }));
        it('http://localhost:port', () => expectConnects({ armadaUrl: `http://localhost:${plain.armadaPort}` }));
        it('http://127.0.0.1:port', () => expectConnects({ armadaUrl: `http://127.0.0.1:${plain.armadaPort}` }));
        it('gRPC-native dns:///localhost:port', () => expectConnects({ armadaUrl: `dns:///localhost:${plain.armadaPort}` }));

        it('IPv6 [::1]:port', function () {
            if (!plain.ipv6) { this.skip(); }
            return expectConnects({ armadaUrl: `[::1]:${plain.armadaPort}` });
        });
        it('IPv6 http://[::1]:port', function () {
            if (!plain.ipv6) { this.skip(); }
            return expectConnects({ armadaUrl: `http://[::1]:${plain.armadaPort}` });
        });

        it('https://localhost:port against a TLS server', function () {
            if (!secure) { this.skip(); }
            return expectConnects({ armadaUrl: `https://localhost:${secure!.armadaPort}` });
        });

        it('forceNoTls overrides an https:// scheme', () =>
            expectConnects({ armadaUrl: `https://localhost:${plain.armadaPort}`, forceNoTls: true }));

        it('forceNoTls against a TLS server is rejected', function () {
            if (!secure) { this.skip(); }
            return expectRejected({ armadaUrl: `https://localhost:${secure!.armadaPort}`, forceNoTls: true });
        });

        it('bare localhost:port against a TLS server is rejected (localhost is plaintext, as in armadactl)', function () {
            if (!secure) { this.skip(); }
            return expectRejected({ armadaUrl: `localhost:${secure!.armadaPort}` });
        });

        it('nothing listening is rejected', async () => {
            const silent = await startSilentTcp();
            const port = silent.port;
            await silent.stop();
            // Port is now closed; on most hosts this is an immediate ECONNREFUSED.
            const result = await quiet(() => within(client({ armadaUrl: `127.0.0.1:${port}` }).testConnection(), 25000, 'testConnection'))
                .catch(() => ({ ok: false }));
            assert.strictEqual(result.ok, false);
        });

        it('trailing slash http://localhost:port/ connects', () =>
            expectConnects({ armadaUrl: `http://localhost:${plain.armadaPort}/` }));
        it('uppercase HTTP:// scheme connects', () =>
            expectConnects({ armadaUrl: `HTTP://localhost:${plain.armadaPort}` }));
        it('surrounding whitespace is tolerated', () =>
            expectConnects({ armadaUrl: ` localhost:${plain.armadaPort} ` }));
        it('https:// with trailing slash connects', async function () {
            if (!secure) { this.skip(); }
            await expectConnects({ armadaUrl: `https://localhost:${secure.armadaPort}/` });
        });
    });

    describe('hung endpoint', () => {
        let silent: HttpFixture;
        before(async () => { silent = await startSilentTcp(); });
        after(() => silent.stop());

        knownBug('armada-vscode-1eb', 'testConnection settles within 10s when the server never responds', async () => {
            const result = await quiet(() => within(client({ armadaUrl: `127.0.0.1:${silent.port}` }).testConnection(), 10000, 'testConnection'));
            assert.strictEqual(result.ok, false);
        }, 15000);
    });

    describe('TLS credential selection (armadactl parity)', () => {
        it('https:// → TLS', () => assert.strictEqual(isSecure(selectCredentials('https://armada.example.com:8443')), true));
        it(':443 → TLS', () => assert.strictEqual(isSecure(selectCredentials('armada.example.com:443')), true));
        it('localhost:port → plaintext', () => assert.strictEqual(isSecure(selectCredentials('localhost:50051')), false));
        it('forceNoTls → plaintext', () => assert.strictEqual(isSecure(selectCredentials('https://armada.example.com', true)), false));

        it('non-localhost host:port defaults to TLS like armadactl', () => {
            assert.strictEqual(isSecure(selectCredentials('armada.example.com:50051')), true);
        });
        it('scheme check is case-insensitive (HTTPS://)', () => {
            assert.strictEqual(isSecure(selectCredentials('HTTPS://armada.example.com:8443')), true);
        });
    });

    describe('Binoculars URL resolution → getJobLogs', () => {
        it('derived as armada port + 2 from bare host:port', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}` }, 'c1'), 'binoculars-plain');
        });
        it('derived as armada port + 2 from http:// URL', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `http://localhost:${plain.armadaPort}` }, 'c1'), 'binoculars-plain');
        });
        it('explicit bare binocularsUrl', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrl: `localhost:${plain.binocularsPort}` }, 'c1'), 'binoculars-plain');
        });
        it('binocularsUrlPattern substitutes {CLUSTER_ID}', async () => {
            // The cluster id doubles as the port so routing is observable.
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrlPattern: 'localhost:{CLUSTER_ID}' }, String(plain.binocularsPort)), 'binoculars-plain');
        });

        it('explicit http:// binocularsUrl', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrl: `http://localhost:${plain.binocularsPort}` }, 'c1'), 'binoculars-plain');
        });
        it('explicit https:// binocularsUrl', async function () {
            if (!secure) { this.skip(); }
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrl: `https://localhost:${secure.binocularsPort}` }, 'c1'), 'binoculars-tls');
        });
        it('http:// binocularsUrlPattern', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrlPattern: 'http://localhost:{CLUSTER_ID}' }, String(plain.binocularsPort)), 'binoculars-plain');
        });
        it('https:// binocularsUrlPattern', async function () {
            if (!secure) { this.skip(); }
            assert.strictEqual(await logsServedBy({ armadaUrl: `localhost:${plain.armadaPort}`, binocularsUrlPattern: 'https://localhost:{CLUSTER_ID}' }, String(secure.binocularsPort)), 'binoculars-tls');
        });
        it('refuses to guess a Binoculars URL for a TLS endpoint and names the setting to add', async function () {
            if (!secure) { this.skip(); }
            // Behind an ingress every service shares :443, so port+2 would be wrong;
            // the client should say which setting is missing instead of dialing a bogus port.
            await assert.rejects(
                logsServedBy({ armadaUrl: `https://localhost:${secure!.armadaPort}` }, 'c1'),
                /binocularsUrl/
            );
        });
        it('derivation tolerates a trailing slash', async () => {
            assert.strictEqual(await logsServedBy({ armadaUrl: `http://localhost:${plain.armadaPort}/` }, 'c1'), 'binoculars-plain');
        });
        it('derivation handles IPv6 [::1]:port', async function () {
            if (!plain.ipv6) { this.skip(); }
            assert.strictEqual(await logsServedBy({ armadaUrl: `[::1]:${plain.armadaPort}` }, 'c1'), 'binoculars-plain');
        });
    });

    describe('authentication', () => {
        // Regression test for armada-vscode-4n2 (fixed on main).
        it('sends basicAuth credentials as an authorization header', async () => {
            plain.metadata.length = 0;
            const c = new ArmadaClient({
                armadaUrl: `localhost:${plain.armadaPort}`,
                auth: { type: 'basic', credentials: { username: 'alice', password: 's3cret' } },
            } as ResolvedConfig);
            await quiet(() => c.testConnection());
            const header = plain.metadata[0]?.get('authorization')[0];
            assert.strictEqual(header, `Basic ${Buffer.from('alice:s3cret').toString('base64')}`);
        });
    });
});
