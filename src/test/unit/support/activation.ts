/**
 * Helpers for driving the real `activate()` under the shared vscode mock.
 */
import { installVscodeMock, mockState, resetMockState, FakeStatusBarItem } from '../vscodeMock';

export interface Activated {
    ctx: { subscriptions: Array<{ dispose(): unknown }>; workspaceState: Memento; globalState: Memento };
    contextItem: FakeStatusBarItem;
    countsItem: FakeStatusBarItem;
    dispose(): void;
}

export interface Memento {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): Promise<void>;
    keys(): readonly string[];
}

export function makeMemento(): Memento {
    const store = new Map<string, unknown>();
    return {
        get: <T>(k: string, d?: T) => (store.has(k) ? store.get(k) as T : d),
        update: async (k: string, v: unknown) => { store.set(k, v); },
        keys: () => [...store.keys()],
    };
}

/**
 * Activate a fresh copy of the extension against `configPath`.
 * Auto-refresh is disabled so timers don't leak between tests.
 */
export async function activateWithConfig(
    configPath: string,
    settings: Record<string, unknown> = {},
    state: { workspaceState?: Memento; globalState?: Memento } = {}
): Promise<Activated> {
    // Other test files uninstall the shared mock in their after() hooks, and the
    // extension module is required at test time, so (re)install it here.
    installVscodeMock();
    resetMockState();
    mockState.settings.set('armada.configPath', configPath);
    mockState.settings.set('armada.autoRefresh', false);
    for (const [k, v] of Object.entries(settings)) { mockState.settings.set(k, v); }

    const ctx = {
        subscriptions: [] as Array<{ dispose(): unknown }>,
        workspaceState: state.workspaceState ?? makeMemento(),
        globalState: state.globalState ?? makeMemento(),
    };
    const extPath = require.resolve('../../../extension');
    delete require.cache[extPath];
    const ext = require(extPath) as typeof import('../../../extension');
    await ext.activate(ctx as any);

    const [contextItem, countsItem] = mockState.statusBarItems;
    return {
        ctx, contextItem, countsItem,
        dispose: () => ctx.subscriptions.forEach(d => d.dispose()),
    };
}

/** Run a registered command the way VS Code would. */
export function runCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const fn = mockState.commands.get(id);
    if (!fn) { throw new Error(`command ${id} is not registered`); }
    return Promise.resolve(fn(...args));
}

/** Poll until `predicate` holds or fail after `ms`. */
export async function eventually(predicate: () => boolean, ms = 3000, what = 'condition'): Promise<void> {
    const deadline = Date.now() + ms;
    while (!predicate()) {
        if (Date.now() > deadline) { throw new Error(`${what} not met within ${ms}ms`); }
        await new Promise(r => setTimeout(r, 25));
    }
}
