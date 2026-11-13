/**
 * Switching between Armada instances.
 *
 * Activates the real extension against a config with several contexts, each
 * pointing at a real fixture Armada server on its own non-default port
 * (plaintext and TLS), and checks that a context switch moves every piece of
 * state — client, status bars, config panel, event streams — to the new
 * instance without leaking anything from the old one.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { vscodeMock, mockState, FakeWebviewPanel } from '../vscodeMock';
import { activateWithConfig, Activated, runCommand, eventually, makeMemento } from '../support/activation';
import { startGrpcPair, GrpcPair } from '../support/connectionFixtures';
import { tlsFixture } from '../setup/tlsFixture';

/** A port that was free a moment ago and has nothing listening on it. */
function closedPort(): Promise<number> {
    return new Promise(resolve => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address() as net.AddressInfo;
            s.close(() => resolve(port));
        });
    });
}

describe('Switching between Armada instances', function () {
    this.timeout(20000);

    let alpha: GrpcPair;   // plaintext
    let beta: GrpcPair;    // TLS when available, otherwise plaintext
    let gamma: GrpcPair;   // second plaintext instance
    let betaUrl: string;
    let downPort: number;
    let tmpDir: string;
    let configPath: string;
    let ext: Activated;

    const savedWindow = { showInputBox: vscodeMock.window.showInputBox, showQuickPick: vscodeMock.window.showQuickPick };
    const savedConsole = { log: console.log, warn: console.warn, error: console.error };

    before(async () => {
        console.log = console.warn = console.error = () => undefined;
        alpha = await startGrpcPair(false, 'alpha');
        beta = await startGrpcPair(!!tlsFixture, 'beta');
        gamma = await startGrpcPair(false, 'gamma');
        betaUrl = tlsFixture ? `https://localhost:${beta.armadaPort}` : `localhost:${beta.armadaPort}`;
        downPort = await closedPort();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-switch-'));
        configPath = path.join(tmpDir, 'armadactl.yaml');
    });

    beforeEach(async () => {
        fs.writeFileSync(configPath, [
            'currentContext: alpha',
            'contexts:',
            '  alpha:',
            `    armadaUrl: localhost:${alpha.armadaPort}`,
            '  beta:',
            `    armadaUrl: ${betaUrl}`,
            '  gamma:',
            `    armadaUrl: http://127.0.0.1:${gamma.armadaPort}`,
            '  down:',
            `    armadaUrl: localhost:${downPort}`,
            '',
        ].join('\n'));
        for (const s of [alpha, beta, gamma]) { s.metadata.length = 0; s.events.length = 0; }
        ext = await activateWithConfig(configPath);
    });

    afterEach(() => {
        ext.dispose();
        mockState.panels.forEach(p => p.dispose());
        Object.assign(vscodeMock.window, savedWindow);
    });

    after(() => {
        Object.assign(console, savedConsole);
        alpha?.stop();
        beta?.stop();
        gamma?.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const currentContextOnDisk = () => /currentContext: (\S+)/.exec(fs.readFileSync(configPath, 'utf8'))?.[1];

    async function openPanelAndTest(): Promise<{ panel: FakeWebviewPanel; result: any }> {
        await runCommand('armada.showConfig');
        const panel = mockState.panels[mockState.panels.length - 1];
        const before = panel.outbox.length;
        await panel.receive({ command: 'testConnection' });
        const result = panel.outbox.slice(before).find((m: any) => m.command === 'testResult');
        return { panel, result };
    }

    async function loadJobSet(queue: string, jobSetId: string): Promise<void> {
        const answers = [queue, jobSetId];
        (vscodeMock.window as any).showInputBox = async () => answers.shift();
        await runCommand('armada.loadJobSet');
    }

    it('connects to the initial instance', async () => {
        const { result } = await openPanelAndTest();
        assert.strictEqual(result.ok, true, result.message);
        assert.strictEqual(alpha.metadata.length, 1);
        assert.strictEqual(ext.contextItem.text, '$(check) Armada: alpha');
    });

    it('re-opened config panel tests the newly selected instance (plaintext → TLS)', async () => {
        await openPanelAndTest();
        await runCommand('armada.switchContext', 'beta');
        const { result, panel } = await openPanelAndTest();
        assert.strictEqual(result.ok, true, result.message);
        assert.strictEqual(beta.metadata.length, 1, 'probe reached beta');
        assert.strictEqual(alpha.metadata.length, 1, 'no further traffic to alpha');
        assert.ok(panel.webview.html.includes(betaUrl), 'panel shows beta URL');
        assert.strictEqual(mockState.panels.length, 1, 'singleton panel reused');
    });

    // Regression test for armada-vscode-lj1.
    it('an already-open config panel follows the switch without being re-opened', async () => {
        await runCommand('armada.showConfig');
        const panel = mockState.panels[0];
        const revealsBefore = panel.revealCount;
        await runCommand('armada.switchContext', 'gamma');
        assert.ok(panel.webview.html.includes(`127.0.0.1:${gamma.armadaPort}`), 'panel shows the new instance');
        assert.strictEqual(panel.revealCount, revealsBefore, 'refresh does not steal focus');
        await panel.receive({ command: 'testConnection' });
        assert.strictEqual(gamma.metadata.length, 1, 'Test Connection probes the new instance');
        assert.strictEqual(alpha.metadata.length, 0, 'and not the previous one');
    });

    it('status bar reflects each instance’s own health, with no stale state carried over', async () => {
        await openPanelAndTest();
        assert.strictEqual(ext.contextItem.text, '$(check) Armada: alpha');

        await runCommand('armada.switchContext', 'down');
        assert.strictEqual(ext.contextItem.text, '$(server-process) Armada: down', 'new instance starts unknown, not "connected"');
        const down = await openPanelAndTest();
        assert.strictEqual(down.result.ok, false);
        assert.strictEqual(ext.contextItem.text, '$(error) Armada: down');

        await runCommand('armada.switchContext', 'alpha');
        assert.strictEqual(ext.contextItem.text, '$(server-process) Armada: alpha', 'error from "down" must not stick to alpha');
        const back = await openPanelAndTest();
        assert.strictEqual(back.result.ok, true);
        assert.strictEqual(ext.contextItem.text, '$(check) Armada: alpha');
    });

    it('job count tooltip follows the active context', async () => {
        assert.match(String(ext.countsItem.tooltip), /^Armada \[alpha\]/);
        await runCommand('armada.switchContext', 'gamma');
        assert.match(String(ext.countsItem.tooltip), /^Armada \[gamma\]/);
        assert.strictEqual(ext.countsItem.text, '$(dash)');
    });

    it('cancels event streams on the old instance', async () => {
        await loadJobSet('q', 'set-a');
        await eventually(() => alpha.events.length === 1, 3000, 'alpha subscription');
        assert.strictEqual(alpha.events[0].cancelled, false);

        await runCommand('armada.switchContext', 'gamma');
        await eventually(() => alpha.events[0].cancelled, 3000, 'alpha stream cancelled');
    });

    // Regression tests for armada-vscode-rke.
    it('job sets monitored on the old instance are not replayed against the new one', async () => {
        await loadJobSet('q', 'set-a');
        await eventually(() => alpha.events.length === 1, 3000, 'alpha subscription');
        await runCommand('armada.switchContext', 'gamma');
        // Give any replay a chance to happen.
        await new Promise(r => setTimeout(r, 500));
        assert.deepStrictEqual(gamma.events.map(e => e.jobSetId), [], 'alpha\'s job set was subscribed on gamma');
    });

    it('each instance keeps its own monitored job sets across switches', async () => {
        await loadJobSet('q', 'set-a');
        await runCommand('armada.switchContext', 'gamma');
        await loadJobSet('q', 'set-g');
        await eventually(() => gamma.events.some(e => e.jobSetId === 'set-g'), 3000, 'gamma subscription');
        await runCommand('armada.switchContext', 'alpha');
        await eventually(() => alpha.events.filter(e => e.jobSetId === 'set-a' && !e.cancelled).length === 1, 3000, 'alpha restored');
        assert.ok(!alpha.events.some(e => e.jobSetId === 'set-g'), 'gamma\'s job set must not reach alpha');
    });

    it('migrates the legacy shared list to the first active instance only', async () => {
        ext.dispose();
        const workspaceState = makeMemento();
        await workspaceState.update('armada.monitoredJobSets', [{ queue: 'q', jobSetId: 'set-legacy', addedAt: '2026-01-01T00:00:00Z' }]);
        for (const s of [alpha, beta, gamma]) { s.events.length = 0; }
        ext = await activateWithConfig(configPath, {}, { workspaceState });

        await eventually(() => alpha.events.some(e => e.jobSetId === 'set-legacy'), 3000, 'legacy list restored on alpha');
        assert.strictEqual(workspaceState.get('armada.monitoredJobSets'), undefined, 'legacy key removed');
        assert.ok(Array.isArray(workspaceState.get(`armada.monitoredJobSets:localhost:${alpha.armadaPort}`)), 'adopted under alpha\'s key');

        await runCommand('armada.switchContext', 'gamma');
        await new Promise(r => setTimeout(r, 500));
        assert.ok(!gamma.events.some(e => e.jobSetId === 'set-legacy'), 'legacy list not replayed on gamma');
    });

    it('switching back restores monitoring on the original instance', async () => {
        await loadJobSet('q', 'set-a');
        await eventually(() => alpha.events.length === 1, 3000, 'alpha subscription');
        await runCommand('armada.switchContext', 'gamma');
        await runCommand('armada.switchContext', 'alpha');
        await eventually(() => alpha.events.filter(e => !e.cancelled && e.jobSetId === 'set-a').length === 1, 3000, 'alpha re-subscribed');
    });

    it('switching to the current context keeps the existing connection', async () => {
        await openPanelAndTest();
        await runCommand('armada.switchContext', 'alpha');
        assert.strictEqual(ext.contextItem.text, '$(check) Armada: alpha', 'client was not torn down');
    });

    it('switching via the quick pick behaves like a direct switch', async () => {
        (vscodeMock.window as any).showQuickPick = async (items: Array<{ context: string }>) => items.find(i => i.context === 'gamma');
        // VS Code passes a TreeView object when invoked from the view title.
        await runCommand('armada.switchContext', { some: 'TreeView' });
        assert.strictEqual(currentContextOnDisk(), 'gamma');
        assert.strictEqual(ext.contextItem.text, '$(server-process) Armada: gamma');
        const { result } = await openPanelAndTest();
        assert.strictEqual(result.ok, true, result.message);
        assert.strictEqual(gamma.metadata.length, 1);
    });

    it('rapid back-to-back switches settle into one consistent state', async () => {
        const sequence = ['beta', 'gamma', 'down', 'alpha', 'gamma'];
        await Promise.all(sequence.map(name => runCommand('armada.switchContext', name)));

        const onDisk = currentContextOnDisk();
        const shown = /Armada: (\S+)$/.exec(ext.contextItem.text)?.[1];
        const tooltipCtx = /^Armada \[(\S+?)\]/.exec(String(ext.countsItem.tooltip))?.[1];
        assert.ok(onDisk, 'config file has a current context');
        assert.strictEqual(shown, onDisk, 'context status bar matches the saved config');
        assert.strictEqual(tooltipCtx, onDisk, 'job count tooltip matches the saved config');

        // And the live client points at the same instance.
        const pairs: Record<string, GrpcPair> = { alpha, beta, gamma };
        for (const s of [alpha, beta, gamma]) { s.metadata.length = 0; }
        const { result } = await openPanelAndTest();
        if (onDisk === 'down') {
            assert.strictEqual(result.ok, false);
        } else {
            assert.strictEqual(result.ok, true, result.message);
            assert.strictEqual(pairs[onDisk!].metadata.length, 1, `probe reached ${onDisk}`);
        }
    });
});
