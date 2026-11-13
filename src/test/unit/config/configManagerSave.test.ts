/**
 * ConfigManager.saveConfig ordering under concurrent context switches.
 *
 * Concurrent fs.writeFile calls to the same file can complete out of order.
 * Rapid context switches used to leave ~/.armadactl.yaml on an older context
 * than the one in memory and in the status bar (seen as an intermittent CI
 * failure in the instance-switching tests).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installVscodeMock, mockState } from '../vscodeMock';

installVscodeMock();

const { ConfigManager } = require('../../../config/configManager') as typeof import('../../../config/configManager');

const CONFIG = [
    'currentContext: a',
    'contexts:',
    '  a: { armadaUrl: "localhost:1" }',
    '  b: { armadaUrl: "localhost:2" }',
    '  c: { armadaUrl: "localhost:3" }',
    '  d: { armadaUrl: "localhost:4" }',
    '',
].join('\n');

/** Earlier writes take longer than later ones: the worst case for ordering. */
class SlowFirstWritesConfigManager extends ConfigManager {
    private writes = 0;
    protected async writeConfigFile(configPath: string, content: string): Promise<void> {
        const delay = Math.max(0, 80 - this.writes++ * 20);
        await new Promise(r => setTimeout(r, delay));
        fs.writeFileSync(configPath, content, 'utf-8');
    }
}

describe('ConfigManager.saveConfig ordering', () => {
    let dir: string;
    let configPath: string;

    beforeEach(() => {
        installVscodeMock();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-save-'));
        configPath = path.join(dir, 'armadactl.yaml');
        fs.writeFileSync(configPath, CONFIG);
        mockState.settings.set('armada.configPath', configPath);
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const onDisk = () => /currentContext: (\S+)/.exec(fs.readFileSync(configPath, 'utf8'))?.[1];

    it('leaves the file on the last context after rapid concurrent switches', async () => {
        const manager = new SlowFirstWritesConfigManager({ appendLine: () => undefined, show: () => undefined } as any);
        await manager.loadConfig();

        await Promise.all(['b', 'c', 'd', 'a', 'c'].map(name => manager.switchContext(name)));

        assert.strictEqual(manager.getCurrentConfig()?.currentContext, 'c');
        assert.strictEqual(onDisk(), 'c', 'file must match the in-memory context');
    });

    it('keeps saving after a failed write', async () => {
        let fail = true;
        class FlakyWriteConfigManager extends ConfigManager {
            protected async writeConfigFile(p: string, content: string): Promise<void> {
                if (fail) { fail = false; throw new Error('disk full'); }
                fs.writeFileSync(p, content, 'utf-8');
            }
        }
        const manager = new FlakyWriteConfigManager({ appendLine: () => undefined, show: () => undefined } as any);
        await manager.loadConfig();

        await assert.rejects(manager.switchContext('b'), /disk full/);
        await manager.switchContext('d');
        assert.strictEqual(onDisk(), 'd');
    });
});
