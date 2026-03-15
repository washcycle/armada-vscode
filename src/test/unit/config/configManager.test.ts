import * as assert from 'assert';
import * as path from 'path';
import { loadArmadaConfig, resolveArmadaConfig } from '../../../config/resolver';

const FIXTURE_PATH = path.resolve(__dirname, '../../../test/fixtures/unit-test-config.yaml');

describe('loadArmadaConfig', () => {
    it('loads unit-test-config.yaml and resolves the active context', async () => {
        const resolved = await loadArmadaConfig(FIXTURE_PATH);
        assert.ok(resolved, 'resolved config should not be null');
        assert.strictEqual(resolved.armadaUrl, 'localhost:30002');
        assert.strictEqual(resolved.currentContext, 'test');
    });

    it('returns null for a non-existent config path', async () => {
        const resolved = await loadArmadaConfig('/tmp/does-not-exist-armada-config.yaml');
        assert.strictEqual(resolved, null);
    });
});

describe('resolveArmadaConfig', () => {
    it('resolves a legacy config with only armadaUrl', () => {
        const legacyConfig = {
            armadaUrl: 'localhost:50051'
        };
        const resolved = resolveArmadaConfig(legacyConfig);
        assert.ok(resolved, 'resolved config should not be null');
        assert.strictEqual(resolved.armadaUrl, 'localhost:50051');
        assert.strictEqual(resolved.currentContext, undefined);
        assert.deepStrictEqual(resolved.auth, { type: 'none' });
    });
});
