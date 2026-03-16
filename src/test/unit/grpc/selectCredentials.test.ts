import * as assert from 'assert';
import * as grpc from '@grpc/grpc-js';
import { selectCredentials } from '../../../grpc/armadaClient';

/** Returns true when the provided credentials use TLS. */
function isSecure(creds: grpc.ChannelCredentials): boolean {
    return (creds as any)._isSecure();
}

describe('selectCredentials', () => {
    it('returns insecure credentials for a plain host:port URL', () => {
        assert.strictEqual(isSecure(selectCredentials('localhost:30002')), false);
    });

    it('returns SSL credentials for https:// URL', () => {
        assert.strictEqual(isSecure(selectCredentials('https://armada.example.com')), true);
    });

    it('returns SSL credentials for a URL on port 443', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:443')), true);
    });

    it('returns SSL credentials for https:// URL on port 443', () => {
        assert.strictEqual(isSecure(selectCredentials('https://armada.example.com:443')), true);
    });

    it('returns insecure credentials when forceNoTls is true, even for https URL', () => {
        assert.strictEqual(isSecure(selectCredentials('https://armada.example.com:443', true)), false);
    });

    it('returns insecure credentials when forceNoTls is true, even for port 443', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:443', true)), false);
    });

    it('returns SSL credentials when forceNoTls is false and URL is port 443', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:443', false)), true);
    });

    it('returns insecure credentials for a non-443 port without scheme', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:50051')), false);
    });

    it('does not match port 1443 as TLS', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:1443')), false);
    });

    it('does not match port 4430 as TLS', () => {
        assert.strictEqual(isSecure(selectCredentials('armada.example.com:4430')), false);
    });
});
