import * as assert from 'assert';
import { deriveBinocularsUrl } from '../../../grpc/armadaClient';

/**
 * The `+2` guess only describes the quickstart's NodePort layout. Behind an
 * ingress it produced 445 (SMB) from 443, and log viewing failed with
 * ECONNREFUSED that read as "Binoculars is down".
 */
describe('deriveBinocularsUrl', () => {
    it('offsets the port by 2 for the quickstart NodePort layout', () => {
        assert.deepStrictEqual(
            deriveBinocularsUrl('localhost:30002'),
            { url: 'localhost:30004', reason: '' }
        );
    });

    it('offsets the gRPC port by 2 for a plain-text host', () => {
        assert.strictEqual(deriveBinocularsUrl('armada.example.com:50051').url, 'armada.example.com:50053');
    });

    it('offsets the port for an explicit http:// scheme, dropping the scheme', () => {
        assert.strictEqual(deriveBinocularsUrl('http://armada.example.com:50051').url, 'armada.example.com:50053');
    });

    it('refuses to derive from port 443 rather than guessing 445', () => {
        const result = deriveBinocularsUrl('armada-server-grpc.tail84e79d.ts.net:443');
        assert.strictEqual(result.url, null, 'must not guess a port for a TLS endpoint');
        assert.ok(/binocularsUrl/.test(result.reason), `reason should name the setting to fix: ${result.reason}`);
    });

    it('refuses to derive from an https:// scheme even on a non-443 port', () => {
        const result = deriveBinocularsUrl('https://armada.example.com:8443');
        assert.strictEqual(result.url, null);
        assert.ok(/binocularsUrl/.test(result.reason));
    });

    it('refuses to derive when no port is present', () => {
        const result = deriveBinocularsUrl('armada.example.com');
        assert.strictEqual(result.url, null);
        assert.ok(/no port/.test(result.reason), `reason should say the port is missing: ${result.reason}`);
    });

    it('reports a parse failure for an unparseable endpoint', () => {
        const result = deriveBinocularsUrl('not a url:::');
        assert.strictEqual(result.url, null);
        assert.ok(result.reason.length > 0, 'a failure must always carry a reason');
    });

    it('never returns a URL without also returning an empty reason', () => {
        for (const url of ['localhost:30002', 'host:50051', 'http://host:1234']) {
            const result = deriveBinocularsUrl(url);
            assert.ok(result.url, `${url} should derive`);
            assert.strictEqual(result.reason, '', `${url} should carry no reason on success`);
        }
    });
});
