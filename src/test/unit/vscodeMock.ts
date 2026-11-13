/**
 * Shared minimal vscode mock for unit tests running outside the VS Code host.
 * Import this and call installVscodeMock() BEFORE requiring any module that
 * transitively depends on 'vscode'.
 *
 * Besides stubbing the API surface, the mock records status bar items,
 * registered commands, webview panels and settings in `mockState` so tests can
 * drive `activate()` and assert on observable UI state.
 */
import * as Module from 'module';

type Listener<T> = (e: T) => unknown;

class FakeEventEmitter<T = unknown> {
    private listeners: Listener<T>[] = [];
    readonly event = (listener: Listener<T>) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(e?: T) { for (const l of [...this.listeners]) { l(e as T); } }
    dispose() { this.listeners = []; }
}

class FakeTreeItem {
    label: string;
    collapsibleState: number;
    description?: string;
    iconPath?: unknown;
    tooltip?: string;
    contextValue?: string;
    command?: unknown;
    constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? 0;
    }
}

export interface FakeStatusBarItem {
    alignment: number;
    priority: number;
    text: string;
    tooltip: string | undefined;
    command: unknown;
    visible: boolean;
    show(): void;
    hide(): void;
    dispose(): void;
}

export interface FakeWebviewPanel {
    title: string;
    revealCount: number;
    /** Messages the extension posted to the webview. */
    outbox: unknown[];
    webview: { html: string; postMessage(m: unknown): Promise<boolean>; onDidReceiveMessage(fn: Listener<unknown>): { dispose(): void } };
    /** Simulate the webview posting a message to the extension host. */
    receive(message: unknown): Promise<unknown[]>;
    /** Optional hooks tests can set to observe updates. */
    onHtml?: (html: string) => void;
    onPost?: (message: unknown) => void;
    reveal(): void;
    onDidDispose(fn: () => void): { dispose(): void };
    dispose(): void;
}

export const mockState = {
    statusBarItems: [] as FakeStatusBarItem[],
    commands: new Map<string, (...args: any[]) => any>(),
    panels: [] as FakeWebviewPanel[],
    settings: new Map<string, unknown>(),
    messages: [] as Array<{ level: 'info' | 'warn' | 'error'; text: string }>,
    configListeners: new FakeEventEmitter<{ affectsConfiguration(section: string): boolean }>(),
};

/** Set a setting and fire onDidChangeConfiguration like VS Code does. */
export function setSetting(key: string, value: unknown): void {
    mockState.settings.set(key, value);
    mockState.configListeners.fire({ affectsConfiguration: (s: string) => key === s || key.startsWith(s + '.') });
}

export function resetMockState(): void {
    mockState.statusBarItems.length = 0;
    mockState.commands.clear();
    mockState.panels.length = 0;
    mockState.settings.clear();
    mockState.messages.length = 0;
}

function createStatusBarItem(alignment: number, priority: number): FakeStatusBarItem {
    const item: FakeStatusBarItem = {
        alignment, priority, text: '', tooltip: undefined, command: undefined, visible: false,
        show() { item.visible = true; },
        hide() { item.visible = false; },
        dispose() { item.visible = false; },
    };
    mockState.statusBarItems.push(item);
    return item;
}

function createWebviewPanel(_viewType: string, title: string): FakeWebviewPanel {
    const messageListeners: Listener<unknown>[] = [];
    const disposeListeners: Array<() => void> = [];
    let html = '';
    const panel: FakeWebviewPanel = {
        title,
        revealCount: 0,
        outbox: [],
        webview: {
            get html() { return html; },
            set html(v: string) { html = v; panel.onHtml?.(v); },
            postMessage: async (m: unknown) => { panel.outbox.push(m); panel.onPost?.(m); return true; },
            onDidReceiveMessage: (fn: Listener<unknown>) => { messageListeners.push(fn); return { dispose: () => undefined }; },
        },
        receive: (m: unknown) => Promise.all(messageListeners.map(fn => fn(m))),
        reveal() { panel.revealCount++; },
        onDidDispose(fn: () => void) { disposeListeners.push(fn); return { dispose: () => undefined }; },
        dispose() { disposeListeners.forEach(fn => fn()); },
    };
    mockState.panels.push(panel);
    return panel;
}

const noopDisposable = { dispose: () => undefined };

export const vscodeMock = {
    EventEmitter: FakeEventEmitter,
    TreeItem: FakeTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(public id: string, public color?: unknown) {} },
    ThemeColor: class { constructor(public id: string) {} },
    window: {
        createTreeView: () => noopDisposable,
        createOutputChannel: () => ({ appendLine: () => undefined, append: () => undefined, show: () => undefined, dispose: () => undefined }),
        createStatusBarItem,
        createWebviewPanel,
        showInputBox: async () => undefined,
        showInformationMessage: async (text: string) => { mockState.messages.push({ level: 'info', text }); return undefined; },
        showErrorMessage: async (text: string) => { mockState.messages.push({ level: 'error', text }); return undefined; },
        showWarningMessage: async (text: string) => { mockState.messages.push({ level: 'warn', text }); return undefined; },
        showQuickPick: async () => undefined,
        activeTextEditor: undefined as unknown,
        withProgress: async (_opts: unknown, task: (p: { report(): void }) => unknown) => task({ report: () => undefined }),
    },
    workspace: {
        getConfiguration: (section?: string) => ({
            get: (key: string, defaultVal?: unknown) => {
                const full = section ? `${section}.${key}` : key;
                return mockState.settings.has(full) ? mockState.settings.get(full) : defaultVal;
            },
            update: async (key: string, value: unknown) => { setSetting(section ? `${section}.${key}` : key, value); },
        }),
        onDidChangeConfiguration: mockState.configListeners.event,
        createFileSystemWatcher: () => ({ onDidChange: () => noopDisposable, onDidCreate: () => noopDisposable, onDidDelete: () => noopDisposable, dispose: () => undefined }),
    },
    languages: {
        createDiagnosticCollection: () => ({ set: () => undefined, delete: () => undefined, clear: () => undefined, dispose: () => undefined }),
        registerCompletionItemProvider: () => noopDisposable,
        registerHoverProvider: () => noopDisposable,
    },
    commands: {
        registerCommand: (id: string, fn: (...args: any[]) => any) => {
            mockState.commands.set(id, fn);
            return { dispose: () => { mockState.commands.delete(id); } };
        },
        executeCommand: async (id: string, ...args: unknown[]) => mockState.commands.get(id)?.(...args),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1, One: 1 },
    ProgressLocation: { Notification: 15 },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    Uri: { file: (p: string) => ({ fsPath: p }), parse: (s: string) => ({ toString: () => s }) },
    RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
};

let installed = false;
let originalRequire: any;

export function installVscodeMock(): void {
    if (installed) { return; }
    originalRequire = (Module as any).prototype.require;
    (Module as any).prototype.require = function(id: string) {
        if (id === 'vscode') { return vscodeMock; }
        return originalRequire.apply(this, arguments);
    };
    installed = true;
}

export function uninstallVscodeMock(): void {
    if (!installed || !originalRequire) { return; }
    (Module as any).prototype.require = originalRequire;
    installed = false;
}
