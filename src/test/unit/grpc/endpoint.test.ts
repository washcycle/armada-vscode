import * as assert from 'assert';
import { describeTlsMode, isLoopbackHost, parseEndpoint, usesTls } from '../../../grpc/endpoint';

describe('parseEndpoint', () => {
    const cases: Array<[string, { scheme?: string; host: string; port?: number; target: string } | undefined]> = [
        ['localhost:30002', { host: 'localhost', port: 30002, target: 'localhost:30002' }],
        ['  localhost:30002  ', { host: 'localhost', port: 30002, target: 'localhost:30002' }],
        ['http://localhost:30002', { scheme: 'http', host: 'localhost', port: 30002, target: 'localhost:30002' }],
        ['HTTP://localhost:30002', { scheme: 'http', host: 'localhost', port: 30002, target: 'localhost:30002' }],
        ['https://armada.example.com/', { scheme: 'https', host: 'armada.example.com', target: 'armada.example.com' }],
        ['HTTPS://armada.example.com:8443//', { scheme: 'https', host: 'armada.example.com', port: 8443, target: 'armada.example.com:8443' }],
        ['https://armada.example.com:8443/api?x=1#y', { scheme: 'https', host: 'armada.example.com', port: 8443, target: 'armada.example.com:8443' }],
        ['[::1]:50051', { host: '::1', port: 50051, target: '[::1]:50051' }],
        ['http://[::1]:50051/', { scheme: 'http', host: '::1', port: 50051, target: '[::1]:50051' }],
        ['10.1.2.3:30002', { host: '10.1.2.3', port: 30002, target: '10.1.2.3:30002' }],
        ['dns:///localhost:30002', { host: 'localhost', port: 30002, target: 'dns:///localhost:30002' }],
        ['dns:armada.example.com:50051', { host: 'armada.example.com', port: 50051, target: 'dns:armada.example.com:50051' }],
        ['', undefined],
        ['   ', undefined],
        ['grpc://host:1', undefined],
        ['host:0', undefined],
        ['host:70000', undefined],
        ['not a url:::', undefined],
    ];
    for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} → ${expected ? expected.target : 'invalid'}`, () => {
            const ep = parseEndpoint(input);
            if (!expected) {
                assert.strictEqual(ep, undefined);
                return;
            }
            assert.ok(ep, 'should parse');
            assert.strictEqual(ep!.scheme, expected.scheme);
            assert.strictEqual(ep!.host, expected.host);
            assert.strictEqual(ep!.port, expected.port);
            assert.strictEqual(ep!.target, expected.target);
        });
    }
});

describe('usesTls (armadactl parity)', () => {
    const cases: Array<[string, boolean | undefined, boolean, string]> = [
        ['armada.example.com:50051', undefined, true, 'non-local host defaults to TLS like armadactl'],
        ['10.1.2.3:30002', undefined, true, 'non-loopback IP defaults to TLS'],
        ['armada.example.com:1443', undefined, true, 'default TLS, not a substring match on 443'],
        ['localhost:30002', undefined, false, 'localhost is plaintext'],
        ['LOCALHOST:30002', undefined, false, 'case-insensitive localhost'],
        ['armada.localhost:30002', undefined, false, '*.localhost is loopback'],
        ['127.0.0.1:30002', undefined, false, 'loopback IPv4'],
        ['127.10.20.30:1', undefined, false, 'all of 127/8'],
        ['[::1]:30002', undefined, false, 'loopback IPv6'],
        ['localhost:443', undefined, true, 'port 443 wins over localhost'],
        ['https://localhost:30002', undefined, true, 'explicit https wins'],
        ['HTTPS://localhost:30002', undefined, true, 'scheme is case-insensitive'],
        ['http://armada.example.com:50051', undefined, false, 'explicit http means plaintext'],
        ['http://armada.example.com:443', undefined, false, 'explicit http beats port 443'],
        ['https://armada.example.com', true, false, 'forceNoTls overrides everything'],
        ['armada.example.com:443', true, false, 'forceNoTls overrides port 443'],
        ['dns:///localhost:30002', undefined, false, 'dns: target to localhost'],
        ['dns:///armada.example.com:50051', undefined, true, 'dns: target to remote host'],
        ['garbage:::', undefined, true, 'unparseable falls back to TLS'],
    ];
    for (const [url, force, expected, why] of cases) {
        it(`${url}${force ? ' (forceNoTls)' : ''} → ${expected ? 'TLS' : 'plaintext'}: ${why}`, () => {
            assert.strictEqual(usesTls(url, force), expected);
        });
    }
});

describe('describeTlsMode', () => {
    it('explains each decision', () => {
        assert.strictEqual(describeTlsMode('localhost:30002'), 'Disabled (localhost)');
        assert.strictEqual(describeTlsMode('armada.example.com:50051'), 'Enabled (default, as armadactl)');
        assert.strictEqual(describeTlsMode('https://a:8443'), 'Enabled (https://)');
        assert.strictEqual(describeTlsMode('http://a:8443'), 'Disabled (http://)');
        assert.strictEqual(describeTlsMode('a:443'), 'Enabled (port 443)');
        assert.strictEqual(describeTlsMode('https://a', true), 'Disabled (forceNoTls)');
    });

    it('agrees with usesTls', () => {
        for (const url of ['localhost:1', 'a.example:1', 'https://x', 'http://x:1', 'x:443', '[::1]:5', '127.0.0.1:9']) {
            assert.strictEqual(describeTlsMode(url).startsWith('Enabled'), usesTls(url), url);
        }
    });
});

describe('isLoopbackHost', () => {
    it('recognises loopback names and addresses only', () => {
        for (const h of ['localhost', 'LocalHost', 'x.localhost', '::1', '127.0.0.1', '127.255.0.9']) {
            assert.strictEqual(isLoopbackHost(h), true, h);
        }
        for (const h of ['localhost.example.com', 'mylocalhost', '128.0.0.1', '10.0.0.1', '::2']) {
            assert.strictEqual(isLoopbackHost(h), false, h);
        }
    });
});
