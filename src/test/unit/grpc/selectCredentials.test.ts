import * as assert from 'assert';
import * as grpc from '@grpc/grpc-js';
import { selectCredentials } from '../../../grpc/armadaClient';

/**
 * Helper that verifies which grpc.credentials factory is used by selectCredentials.
 * It monkey-patches createSsl/createInsecure to record calls, then restores them.
 */
function expectCredentialType(
    target: string,
    forceNoTls: boolean | undefined,
    expectedSecure: boolean
): void {
    const originalCreateSsl = grpc.credentials.createSsl;
    const originalCreateInsecure = grpc.credentials.createInsecure;

    let sslCalled = 0;
    let insecureCalled = 0;

    (grpc.credentials as any).createSsl = (...args: any[]): grpc.ChannelCredentials => {
        sslCalled++;
        return originalCreateSsl.apply(grpc.credentials, args as any);
    };

    (grpc.credentials as any).createInsecure = (...args: any[]): grpc.ChannelCredentials => {
        insecureCalled++;
        return originalCreateInsecure.apply(grpc.credentials, args as any);
    };

    try {
        // Invoke the function under test; the returned value is not directly inspected.
        if (typeof forceNoTls === 'undefined') {
            selectCredentials(target);
        } else {
            selectCredentials(target, forceNoTls);
        }

        // Ensure exactly one type of credentials was selected, matching expectation.
        assert.strictEqual(
            sslCalled > 0,
            expectedSecure,
            `Expected TLS credentials=${expectedSecure} for target "${target}" (forceNoTls=${forceNoTls}), ` +
            `but createSsl was${sslCalled > 0 ? '' : ' not'} called.`
        );
        assert.strictEqual(
            insecureCalled > 0,
            !expectedSecure,
            `Expected insecure credentials=${!expectedSecure} for target "${target}" (forceNoTls=${forceNoTls}), ` +
            `but createInsecure was${insecureCalled > 0 ? '' : ' not'} called.`
        );
    } finally {
        (grpc.credentials as any).createSsl = originalCreateSsl;
        (grpc.credentials as any).createInsecure = originalCreateInsecure;
    }
}

describe('selectCredentials', () => {
    it('returns insecure credentials for a plain host:port URL', () => {
        expectCredentialType('localhost:30002', undefined, false);
    });

    it('returns SSL credentials for https:// URL', () => {
        expectCredentialType('https://armada.example.com', undefined, true);
    });

    it('returns SSL credentials for a URL on port 443', () => {
        expectCredentialType('armada.example.com:443', undefined, true);
    });

    it('returns SSL credentials for https:// URL on port 443', () => {
        expectCredentialType('https://armada.example.com:443', undefined, true);
    });

    it('returns insecure credentials when forceNoTls is true, even for https URL', () => {
        expectCredentialType('https://armada.example.com:443', true, false);
    });

    it('returns insecure credentials when forceNoTls is true, even for port 443', () => {
        expectCredentialType('armada.example.com:443', true, false);
    });

    it('returns SSL credentials when forceNoTls is false and URL is port 443', () => {
        expectCredentialType('armada.example.com:443', false, true);
    });

    it('returns insecure credentials for a non-443 port without scheme', () => {
        expectCredentialType('armada.example.com:50051', undefined, false);
    });

    it('does not match port 1443 as TLS', () => {
        expectCredentialType('armada.example.com:1443', undefined, false);
    });

    it('does not match port 4430 as TLS', () => {
        expectCredentialType('armada.example.com:4430', undefined, false);
    });
});
