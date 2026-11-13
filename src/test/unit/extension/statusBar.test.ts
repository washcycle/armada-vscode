/**
 * Activation-level tests for the job count status bar item.
 *
 * Drives the real `activate()` against the shared vscode mock and a temporary
 * armadactl config with two contexts on non-default ports, then asserts on the
 * recorded StatusBarItem state.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installVscodeMock, uninstallVscodeMock, mockState, setSetting, FakeStatusBarItem } from '../vscodeMock';
import { activateWithConfig } from '../support/activation';

installVscodeMock();

const { JobTreeProvider } = require('../../../providers/jobTreeProvider') as typeof import('../../../providers/jobTreeProvider');
const { buildJobCountTooltip, shouldShowJobCounts } = require('../../../util/jobCountLabel') as typeof import('../../../util/jobCountLabel');

type Provider = InstanceType<typeof JobTreeProvider>;

// Capture the JobTreeProvider instance created by activate(): updateJobCountsBar
// calls getJobCounts() on it during activation.
let lastProvider: Provider | undefined;
const originalGetJobCounts = JobTreeProvider.prototype.getJobCounts;
JobTreeProvider.prototype.getJobCounts = function (this: Provider) {
    lastProvider = this;
    return originalGetJobCounts.call(this);
};

async function activate(configPath: string) {
    lastProvider = undefined;
    const a = await activateWithConfig(configPath);
    return { ctx: a.ctx, contextItem: a.contextItem, countsItem: a.countsItem };
}

function addJobs(provider: Provider, states: string[]) {
    // Don't open gRPC event streams from a unit test
    (provider as any).monitorJobSet = () => undefined;
    states.forEach((state, i) => provider.addJob({ jobId: `j${i}`, queue: 'q', jobSetId: 's1', state } as any));
}

describe('Job count status bar item (activation)', () => {
    let tmpDir: string;
    let configPath: string;
    let countsItem: FakeStatusBarItem;
    let contextItem: FakeStatusBarItem;
    let ctx: any;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armada-statusbar-'));
        configPath = path.join(tmpDir, 'armadactl.yaml');
    });

    beforeEach(async () => {
        fs.writeFileSync(configPath, [
            'currentContext: alpha',
            'contexts:',
            '  alpha:',
            '    armadaUrl: localhost:38512',
            '  beta:',
            '    armadaUrl: https://armada.example.test:8443',
            '    lookoutUrl: http://lookout.example.test:8089',
            '',
        ].join('\n'));
        ({ ctx, contextItem, countsItem } = await activate(configPath));
    });

    afterEach(() => {
        ctx.subscriptions.forEach((d: { dispose(): unknown }) => d.dispose());
    });

    after(() => {
        JobTreeProvider.prototype.getJobCounts = originalGetJobCounts;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates the counts item next to (one priority below) the context item', () => {
        assert.strictEqual(mockState.statusBarItems.length, 2);
        assert.strictEqual(countsItem.priority, contextItem.priority - 1);
    });

    it('shows $(dash) with the active context in the tooltip when no jobs are monitored', () => {
        assert.strictEqual(countsItem.visible, true);
        assert.strictEqual(countsItem.text, '$(dash)');
        assert.strictEqual(countsItem.tooltip, 'Armada [alpha]: no monitored jobs');
    });

    it('updates label and per-state tooltip when jobs are added', () => {
        assert.ok(lastProvider, 'provider instance captured');
        addJobs(lastProvider!, ['RUNNING', 'RUNNING', 'RUNNING', 'FAILED', 'QUEUED', 'PENDING', 'SUCCEEDED']);
        assert.strictEqual(countsItem.text, '$(play) 3  $(error) 1  $(clock) 2');
        assert.strictEqual(countsItem.tooltip, 'Armada [alpha]\nRunning: 3\nFailed: 1\nQueued: 1\nPending: 1\nSucceeded: 1');
    });

    it('hides immediately when the setting is turned off, without waiting for a refresh', () => {
        setSetting('armada.statusBar.showJobCounts', false);
        assert.strictEqual(countsItem.visible, false);
        setSetting('armada.statusBar.showJobCounts', true);
        assert.strictEqual(countsItem.visible, true);
    });

    it('ignores unrelated setting changes', () => {
        countsItem.hide();
        setSetting('armada.refreshInterval', 1000);
        assert.strictEqual(countsItem.visible, false, 'unrelated change should not re-render');
    });

    it('stays hidden across refreshes while the setting is off', () => {
        setSetting('armada.statusBar.showJobCounts', false);
        lastProvider!.refresh();
        assert.strictEqual(countsItem.visible, false);
    });

    it('resets counts and follows the context on context switch', async () => {
        addJobs(lastProvider!, ['RUNNING', 'FAILED']);
        await mockState.commands.get('armada.switchContext')!('beta');
        assert.strictEqual(countsItem.text, '$(dash)');
        assert.strictEqual(countsItem.tooltip, 'Armada [beta]: no monitored jobs');
        assert.match(fs.readFileSync(configPath, 'utf8'), /currentContext: beta/);
    });

    it('has no click command until armada.filterByState exists (task 3.4 deferred)', () => {
        assert.strictEqual(countsItem.command, undefined);
        assert.strictEqual(mockState.commands.has('armada.filterByState'), false,
            'armada.filterByState now exists — wire the status bar click (tasks.md 3.4) and update this test');
    });
});

describe('Job count status bar item (unconfigured)', () => {
    after(() => uninstallVscodeMock());

    it('is hidden when no config file exists', async () => {
        installVscodeMock();
        const missing = path.join(os.tmpdir(), `armada-missing-${process.pid}-${Date.now()}.yaml`);
        const { ctx, contextItem, countsItem } = await activate(missing);
        try {
            assert.match(contextItem.text, /Not configured/);
            assert.strictEqual(countsItem.visible, false);
        } finally {
            ctx.subscriptions.forEach((d: { dispose(): unknown }) => d.dispose());
        }
    });
});

describe('buildJobCountTooltip()', () => {
    it('reports no monitored jobs for an empty map', () => {
        assert.strictEqual(buildJobCountTooltip('dev', {}), 'Armada [dev]: no monitored jobs');
    });

    it('omits zero counts and orders known states first, unknown states alphabetically after', () => {
        const tip = buildJobCountTooltip('prod', { SUCCEEDED: 2, ZETA: 1, RUNNING: 0, FAILED: 1, ALPHA: 3 });
        assert.strictEqual(tip, 'Armada [prod]\nFailed: 1\nSucceeded: 2\nAlpha: 3\nZeta: 1');
    });
});

describe('shouldShowJobCounts()', () => {
    it('requires both a config and the setting', () => {
        assert.strictEqual(shouldShowJobCounts(true, true), true);
        assert.strictEqual(shouldShowJobCounts(false, true), false);
        assert.strictEqual(shouldShowJobCounts(true, false), false);
        assert.strictEqual(shouldShowJobCounts(false, false), false);
    });
});
