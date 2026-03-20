import * as assert from 'assert';
import { installVscodeMock, uninstallVscodeMock, vscodeMock } from '../vscodeMock';

// ---------------------------------------------------------------------------
// vscode mock — must be injected before requiring the module under test.
// We use the shared complete mock and override the window spy methods.
// ---------------------------------------------------------------------------
const shownInfo: string[] = [];
const shownErrors: string[] = [];

installVscodeMock();

// Override window methods to capture messages for assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(vscodeMock.window as any).showInformationMessage = async (msg: string) => { shownInfo.push(msg); return undefined; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(vscodeMock.window as any).showErrorMessage = async (msg: string) => { shownErrors.push(msg); return undefined; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(vscodeMock.window as any).showQuickPick = async () => undefined; // simulate user cancelling QuickPick

// Import AFTER the mock is in place
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { switchContextCommand } = require('../../../commands/switchContext');

// ---------------------------------------------------------------------------
// Minimal ConfigManager stub
// ---------------------------------------------------------------------------
function makeConfigManager(contexts: string[], current: string) {
    const switched: string[] = [];
    return {
        getContexts: () => contexts,
        getCurrentConfig: () => ({ currentContext: current }),
        switchContext: async (name: string) => {
            if (!contexts.includes(name)) {
                throw new Error(`Context "${name}" not found`);
            }
            switched.push(name);
        },
        _switched: switched,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('switchContextCommand', () => {
    beforeEach(() => {
        shownInfo.length = 0;
        shownErrors.length = 0;
    });

    // Regression: VS Code passes a TreeViewItem object when the command is
    // invoked from the view title bar. Before the fix, this would call
    // configManager.switchContext('[object Object]') and show an error.
    it('regression: object arg (TreeViewItem) is treated as no contextName — opens QuickPick flow', async () => {
        const mgr = makeConfigManager(['dev', 'prod'], 'dev');
        const treeViewItemObj = { label: 'prod', description: '$(check) Current', context: 'prod' };

        // Pass the object as if VS Code injected it (cast to any to bypass TS)
        await switchContextCommand(mgr, treeViewItemObj as any);

        // Should NOT have switched — QuickPick returned undefined (user cancelled)
        assert.strictEqual(mgr._switched.length, 0, 'switchContext must not be called with an object arg');
        assert.strictEqual(shownErrors.length, 0, 'no error should be shown');
    });

    it('string contextName switches directly without QuickPick', async () => {
        const mgr = makeConfigManager(['dev', 'prod'], 'dev');

        await switchContextCommand(mgr, 'prod');

        assert.deepStrictEqual(mgr._switched, ['prod']);
        assert.ok(shownInfo.some(m => m.includes('prod')), 'success message shown');
    });

    it('same contextName as current is a no-op', async () => {
        const mgr = makeConfigManager(['dev', 'prod'], 'dev');

        await switchContextCommand(mgr, 'dev');

        assert.strictEqual(mgr._switched.length, 0);
    });

    it('unknown contextName shows an error', async () => {
        const mgr = makeConfigManager(['dev', 'prod'], 'dev');

        await switchContextCommand(mgr, 'staging');

        assert.strictEqual(mgr._switched.length, 0);
        assert.ok(shownErrors.some(m => m.includes('staging') || m.includes('Failed')));
    });

    it('undefined contextName falls through to QuickPick (user cancels → no switch)', async () => {
        const mgr = makeConfigManager(['dev', 'prod'], 'dev');

        await switchContextCommand(mgr, undefined);

        assert.strictEqual(mgr._switched.length, 0, 'QuickPick cancelled — no switch');
    });

    after(() => {
        uninstallVscodeMock();
    });
});
