import * as assert from 'assert';
import { installVscodeMock } from '../vscodeMock';

installVscodeMock();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { formatTimestamp, formatQuantity } = require('../../../panels/jobDetailPanel');

/**
 * The job detail panel receives the same instants in two shapes: protobuf
 * `Timestamp` messages from the gRPC Query API (loaded with `longs: String`,
 * so `{seconds: "...", nanos: n}`) and ISO strings from Lookout's REST API.
 * Interpolating the former rendered "[object Object]" in the webview.
 */
describe('formatTimestamp', function () {
    it('decodes a protobuf Timestamp with string seconds (longs: String)', function () {
        assert.strictEqual(
            formatTimestamp({ seconds: '1785240065', nanos: 0 }),
            '2026-07-28T12:01:05.000Z'
        );
    });

    it('decodes a protobuf Timestamp with numeric seconds', function () {
        assert.strictEqual(
            formatTimestamp({ seconds: 1785240065, nanos: 0 }),
            '2026-07-28T12:01:05.000Z'
        );
    });

    it('includes sub-second precision from nanos', function () {
        assert.strictEqual(
            formatTimestamp({ seconds: '1785240065', nanos: 500000000 }),
            '2026-07-28T12:01:05.500Z'
        );
    });

    it('treats an all-zero Timestamp as absent rather than showing 1970', function () {
        // `defaults: true` materialises unset timestamps as {seconds: "0", nanos: 0}
        assert.strictEqual(formatTimestamp({ seconds: '0', nanos: 0 }), undefined);
    });

    it('passes through an ISO string from the Lookout REST API', function () {
        assert.strictEqual(
            formatTimestamp('2026-07-28T12:01:05Z'),
            '2026-07-28T12:01:05.000Z'
        );
    });

    it('accepts a stringified epoch', function () {
        assert.strictEqual(formatTimestamp('1785240065'), '2026-07-28T12:01:05.000Z');
    });

    it('returns undefined for null, undefined and empty string', function () {
        assert.strictEqual(formatTimestamp(null), undefined);
        assert.strictEqual(formatTimestamp(undefined), undefined);
        assert.strictEqual(formatTimestamp(''), undefined);
    });

    it('never returns "[object Object]" for an unrecognised object', function () {
        const out = formatTimestamp({ unexpected: true });
        assert.strictEqual(out, undefined);
    });

    it('returns undefined rather than "Invalid Date" for out-of-range seconds', function () {
        assert.strictEqual(formatTimestamp({ seconds: '99999999999999999', nanos: 0 }), undefined);
    });

    it('keeps a non-date string as-is instead of discarding it', function () {
        assert.strictEqual(formatTimestamp('not a date'), 'not a date');
    });
});

/**
 * k8s models `resource.Quantity` as a message with a single `string` field, so
 * the resource rows hit the same "[object Object]" failure as the timestamps.
 */
describe('formatQuantity', function () {
    it('unwraps a proto Quantity message', function () {
        assert.strictEqual(formatQuantity({ string: '900m' }), '900m');
        assert.strictEqual(formatQuantity({ string: '150Gi' }), '150Gi');
    });

    it('passes through plain strings and numbers from Lookout', function () {
        assert.strictEqual(formatQuantity('16'), '16');
        assert.strictEqual(formatQuantity(16), '16');
    });

    it('returns undefined for absent or empty values so callers can show a dash', function () {
        assert.strictEqual(formatQuantity(undefined), undefined);
        assert.strictEqual(formatQuantity(null), undefined);
        assert.strictEqual(formatQuantity(''), undefined);
        assert.strictEqual(formatQuantity({ string: '' }), undefined);
    });
});
