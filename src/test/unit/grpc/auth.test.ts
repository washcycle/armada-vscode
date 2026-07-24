import * as assert from 'assert';
import * as grpc from '@grpc/grpc-js';
import { buildAuthHeader, isSecureCredentials, makeAuthInterceptor, OidcNotSupportedError, withCallCredentials } from '../../../grpc/auth';

describe('buildAuthHeader', () => {
    it('encodes basic auth as Basic base64(user:pass)', async () => {
        const header = await buildAuthHeader({
            type: 'basic',
            credentials: { username: 'apqx', password: 's3cret' }
        });
        const expected = 'Basic ' + Buffer.from('apqx:s3cret').toString('base64');
        assert.strictEqual(header, expected);
    });

    it('handles a basic auth password containing a colon', async () => {
        // Only the first colon separates user from password, so a colon in the
        // password must survive the round trip.
        const header = await buildAuthHeader({
            type: 'basic',
            credentials: { username: 'user', password: 'pa:ss:word' }
        });
        const decoded = Buffer.from(header!.replace('Basic ', ''), 'base64').toString('utf-8');
        assert.strictEqual(decoded, 'user:pa:ss:word');
    });

    it('returns undefined when auth is absent', async () => {
        assert.strictEqual(await buildAuthHeader(undefined), undefined);
    });

    it('returns undefined for auth type none', async () => {
        assert.strictEqual(await buildAuthHeader({ type: 'none' }), undefined);
    });

    it('returns undefined for basic auth with no username', async () => {
        assert.strictEqual(
            await buildAuthHeader({ type: 'basic', credentials: { password: 'x' } }),
            undefined
        );
    });

    it('produces a Bearer header from an execAuth command', async () => {
        const header = await buildAuthHeader({
            type: 'exec',
            credentials: { cmd: 'printf', args: ['tok-123'] }
        });
        assert.strictEqual(header, 'Bearer tok-123');
    });

    it('trims trailing newlines from execAuth output', async () => {
        const header = await buildAuthHeader({
            type: 'exec',
            credentials: { cmd: 'printf', args: ['tok-456\n'] }
        });
        assert.strictEqual(header, 'Bearer tok-456');
    });

    it('rejects when the execAuth command fails', async () => {
        await assert.rejects(
            () => buildAuthHeader({ type: 'exec', credentials: { cmd: 'false' } }),
            /execAuth command "false" failed/
        );
    });

    it('throws OidcNotSupportedError for oidc rather than sending nothing', async () => {
        await assert.rejects(
            () => buildAuthHeader({ type: 'oidc', credentials: { providerUrl: 'https://kc', clientId: 'c' } }),
            (error: Error) => {
                assert.ok(error instanceof OidcNotSupportedError);
                assert.match(error.message, /not yet supported/);
                return true;
            }
        );
    });
});

describe('isSecureCredentials', () => {
    it('reports TLS credentials as secure', () => {
        assert.strictEqual(isSecureCredentials(grpc.credentials.createSsl()), true);
    });

    it('reports insecure credentials as not secure', () => {
        assert.strictEqual(isSecureCredentials(grpc.credentials.createInsecure()), false);
    });
});

describe('withCallCredentials', () => {
    it('composes call credentials onto a TLS channel', () => {
        const composed = withCallCredentials(
            grpc.credentials.createSsl(),
            async () => 'Basic abc'
        );
        assert.strictEqual(isSecureCredentials(composed), true);
    });

    it('leaves insecure credentials untouched instead of throwing', () => {
        // grpc-js raises "Cannot compose insecure credentials" if call
        // credentials are attached to a plaintext channel, so this path must
        // return the original object and let the interceptor carry the header.
        const insecure = grpc.credentials.createInsecure();
        assert.strictEqual(withCallCredentials(insecure, async () => 'Basic abc'), insecure);
    });
});

describe('makeAuthInterceptor', () => {
    /** Drive an interceptor's start() the way grpc-js does and capture metadata. */
    function runInterceptor(
        interceptor: grpc.Interceptor,
        onDone: (metadata: grpc.Metadata) => void
    ): void {
        const metadata = new grpc.Metadata();
        const nextCall = () => ({
            start: (md: grpc.Metadata) => onDone(md),
            sendMessage: () => undefined,
            halfClose: () => undefined,
            cancel: () => undefined
        }) as any;

        const call = interceptor({ method_definition: {} } as any, nextCall);
        call.start(metadata, {});
    }

    it('sets the authorization header on outgoing calls', (done) => {
        const interceptor = makeAuthInterceptor(async () => 'Basic xyz');
        runInterceptor(interceptor, (metadata) => {
            assert.strictEqual(metadata.get('authorization')[0], 'Basic xyz');
            done();
        });
    });

    it('proceeds without a header when none is available', (done) => {
        const interceptor = makeAuthInterceptor(async () => undefined);
        runInterceptor(interceptor, (metadata) => {
            assert.strictEqual(metadata.get('authorization').length, 0);
            done();
        });
    });

    it('reports the error and still starts the call when the provider throws', (done) => {
        const logged: string[] = [];
        const interceptor = makeAuthInterceptor(
            async () => { throw new Error('token fetch failed'); },
            message => logged.push(message)
        );
        runInterceptor(interceptor, (metadata) => {
            assert.strictEqual(metadata.get('authorization').length, 0);
            assert.strictEqual(logged.length, 1);
            assert.match(logged[0], /token fetch failed/);
            done();
        });
    });
});
