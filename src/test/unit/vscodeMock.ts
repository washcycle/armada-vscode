/**
 * Shared minimal vscode mock for unit tests running outside the VS Code host.
 * Import this and call installVscodeMock() BEFORE requiring any module that
 * transitively depends on 'vscode'.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import * as Module from 'module';

class FakeEventEmitter {
    fire() { /* no-op */ }
    get event() { return () => ({ dispose: () => undefined }); }
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

export const vscodeMock = {
    EventEmitter: FakeEventEmitter,
    TreeItem: FakeTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(public id: string, public color?: unknown) {} },
    ThemeColor: class { constructor(public id: string) {} },
    window: {
        createTreeView: () => ({ dispose: () => undefined }),
        showInputBox: async () => undefined,
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showQuickPick: async () => undefined,
    },
    workspace: {
        getConfiguration: () => ({ get: (_key: string, defaultVal?: unknown) => defaultVal }),
    },
    commands: {
        executeCommand: async () => undefined,
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1 },
    ProgressLocation: { Notification: 15 },
    Uri: { file: (p: string) => ({ fsPath: p }) },
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
