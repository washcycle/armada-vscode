import * as vscode from 'vscode';
import { ResolvedConfig } from '../types/config';
import { ArmadaClient } from '../grpc/armadaClient';

const SECRET_KEY_PATTERN = /password|token|secret|key/i;

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isMasked(key: string): boolean {
    return SECRET_KEY_PATTERN.test(key);
}

export class ConfigPanel {
    private static instance: ConfigPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    static show(
        config: ResolvedConfig | null,
        client: ArmadaClient | undefined,
        contexts: string[]
    ): void {
        if (ConfigPanel.instance) {
            ConfigPanel.instance.panel.reveal();
            ConfigPanel.instance.update(config, client, contexts);
            return;
        }
        new ConfigPanel(config, client, contexts);
    }

    private constructor(
        config: ResolvedConfig | null,
        client: ArmadaClient | undefined,
        contexts: string[]
    ) {

        this.panel = vscode.window.createWebviewPanel(
            'armadaConfig',
            'Armada: Configuration',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        ConfigPanel.instance = this;

        this.panel.onDidDispose(() => {
            ConfigPanel.instance = undefined;
            this.disposables.forEach(d => d.dispose());
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'testConnection') {
                    if (!client) {
                        this.panel.webview.postMessage({
                            command: 'testResult',
                            ok: false,
                            message: 'Armada client not initialized. Please check your configuration.'
                        });
                        return;
                    }
                    const result = await client.testConnection();
                    this.panel.webview.postMessage({
                        command: 'testResult',
                        ok: result.ok,
                        detail: result.detail,
                        message: result.message
                    });
                } else if (message.command === 'switchContext') {
                    vscode.commands.executeCommand('armada.switchContext');
                } else if (message.command === 'revealSecret') {
                    const value = this.resolveSecretValue(config, message.field);
                    this.panel.webview.postMessage({
                        command: 'secretRevealed',
                        field: message.field,
                        value: value ?? '(not set)'
                    });
                }
            },
            null,
            this.disposables
        );

        this.update(config, client, contexts);
    }

    private resolveSecretValue(config: ResolvedConfig | null, field: string): string | undefined {
        if (!config?.auth?.credentials) { return undefined; }
        const creds = config.auth.credentials as Record<string, any>;
        return creds[field] !== undefined ? String(creds[field]) : undefined;
    }

    update(config: ResolvedConfig | null, _client: ArmadaClient | undefined, contexts: string[]): void {
        this.panel.webview.html = this.renderHtml(config, contexts);
    }

    private renderHtml(config: ResolvedConfig | null, contexts: string[]): string {
        if (!config) {
            return this.wrapHtml(`
                <div class="section">
                    <p class="muted">No Armada configuration found.</p>
                    <p>Run <strong>Armada: Setup Configuration</strong> from the command palette to get started.</p>
                </div>
            `);
        }

        const ctx = config.currentContext || 'default';

        const contextDropdown = contexts.length > 1 ? `
            <div class="row">
                <span class="label">Context</span>
                <span class="value">
                    <select id="ctxSelect" onchange="switchContext(this.value)">
                        ${contexts.map(c => `<option value="${esc(c)}"${c === ctx ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                </span>
            </div>` : `
            <div class="row">
                <span class="label">Context</span>
                <span class="value">${esc(ctx)}</span>
            </div>`;

        const tls = config.forceNoTls ? 'Disabled (forceNoTls)' : 'Enabled (auto-detect)';

        const connectionRows = `
            ${contextDropdown}
            <div class="row">
                <span class="label">Server URL</span>
                <span class="value mono">${esc(config.armadaUrl)}</span>
            </div>
            <div class="row">
                <span class="label">TLS</span>
                <span class="value">${esc(tls)}</span>
            </div>
            ${config.binocularsUrl ? `
            <div class="row">
                <span class="label">Binoculars URL</span>
                <span class="value mono">${esc(config.binocularsUrl)}</span>
            </div>` : ''}
            ${config.binocularsUrlPattern ? `
            <div class="row">
                <span class="label">Binoculars Pattern</span>
                <span class="value mono">${esc(config.binocularsUrlPattern)}</span>
            </div>` : ''}
            ${config.lookoutUrl ? `
            <div class="row">
                <span class="label">Lookout URL</span>
                <span class="value mono">${esc(config.lookoutUrl)}</span>
            </div>` : ''}
        `;

        const authRows = this.renderAuthRows(config);

        return this.wrapHtml(`
            <h2>Configuration</h2>

            <div class="section">
                <h3>Connection</h3>
                ${connectionRows}
            </div>

            <div class="section">
                <h3>Authentication</h3>
                ${authRows}
            </div>

            <div class="section">
                <button id="testBtn" onclick="testConnection()">Test Connection</button>
                <span id="spinner" class="spinner hidden">&#8987;</span>
                <div id="testResult" class="hidden"></div>
            </div>
        `);
    }

    private renderAuthRows(config: ResolvedConfig): string {
        const auth = config.auth;
        if (!auth || auth.type === 'none') {
            return `<div class="row"><span class="label">Type</span><span class="value muted">None</span></div>`;
        }

        const rows: string[] = [
            `<div class="row"><span class="label">Type</span><span class="value">${esc(auth.type.toUpperCase())}</span></div>`
        ];

        const creds = (auth.credentials ?? {}) as Record<string, any>;

        for (const [key, value] of Object.entries(creds)) {
            if (value === null || value === undefined) { continue; }
            if (Array.isArray(value) || typeof value === 'object') {
                // Render arrays/objects as compact JSON
                rows.push(`<div class="row">
                    <span class="label">${esc(key)}</span>
                    <span class="value mono small">${esc(JSON.stringify(value))}</span>
                </div>`);
                continue;
            }
            if (isMasked(key)) {
                rows.push(`<div class="row">
                    <span class="label">${esc(key)}</span>
                    <span class="value">
                        <span id="masked-${esc(key)}" class="masked">••••••••</span>
                        <span id="plain-${esc(key)}" class="hidden mono"></span>
                        <button class="inline-btn" id="toggle-${esc(key)}"
                            onclick="toggleSecret('${esc(key)}')">Show</button>
                    </span>
                </div>`);
            } else {
                rows.push(`<div class="row">
                    <span class="label">${esc(key)}</span>
                    <span class="value mono">${esc(String(value))}</span>
                </div>`);
            }
        }

        return rows.join('\n');
    }

    private wrapHtml(body: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 24px;
    max-width: 680px;
  }
  h2 { margin-top: 0; font-size: 1.2em; }
  h3 { font-size: 1em; margin: 0 0 8px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.06em; }
  .section { margin-bottom: 24px; }
  .row { display: flex; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border, #333); }
  .row:last-child { border-bottom: none; }
  .label { width: 160px; flex-shrink: 0; color: var(--vscode-descriptionForeground); }
  .value { flex: 1; word-break: break-all; }
  .mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.95em; }
  .small { font-size: 0.85em; }
  .muted { color: var(--vscode-descriptionForeground); }
  .masked { letter-spacing: 0.1em; }
  .hidden { display: none; }
  select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 2px 4px;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .inline-btn {
    background: none;
    color: var(--vscode-textLink-foreground);
    border: none;
    padding: 0 4px;
    cursor: pointer;
    font-size: 0.9em;
  }
  .inline-btn:hover { text-decoration: underline; }
  .spinner { margin-left: 8px; }
  #testResult { margin-top: 12px; padding: 10px 14px; border-radius: 3px; }
  #testResult.ok { background: var(--vscode-diffEditor-insertedLineBackground, rgba(0,128,0,0.15)); color: var(--vscode-terminal-ansiGreen, #4caf50); }
  #testResult.err { background: var(--vscode-diffEditor-removedLineBackground, rgba(128,0,0,0.15)); color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();

  function testConnection() {
    const btn = document.getElementById('testBtn');
    const spinner = document.getElementById('spinner');
    const result = document.getElementById('testResult');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    result.classList.add('hidden');
    result.className = 'hidden';
    vscode.postMessage({ command: 'testConnection' });
  }

  function toggleSecret(field) {
    const masked = document.getElementById('masked-' + field);
    const plain = document.getElementById('plain-' + field);
    const btn = document.getElementById('toggle-' + field);
    if (btn.textContent === 'Show') {
      vscode.postMessage({ command: 'revealSecret', field: field });
    } else {
      masked.classList.remove('hidden');
      plain.classList.add('hidden');
      btn.textContent = 'Show';
    }
  }

  function switchContext(ctx) {
    // Context switching still goes through the extension command
    vscode.postMessage({ command: 'switchContext', context: ctx });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'testResult') {
      const btn = document.getElementById('testBtn');
      const spinner = document.getElementById('spinner');
      const result = document.getElementById('testResult');
      btn.disabled = false;
      spinner.classList.add('hidden');
      if (msg.ok) {
        result.className = 'ok';
        result.textContent = '✓ Connected' + (msg.detail ? ' · ' + msg.detail : '');
      } else {
        result.className = 'err';
        result.textContent = '✗ ' + (msg.message || 'Connection failed');
      }
    } else if (msg.command === 'secretRevealed') {
      const masked = document.getElementById('masked-' + msg.field);
      const plain = document.getElementById('plain-' + msg.field);
      const btn = document.getElementById('toggle-' + msg.field);
      if (masked && plain && btn) {
        plain.textContent = msg.value;
        masked.classList.add('hidden');
        plain.classList.remove('hidden');
        btn.textContent = 'Hide';
      }
    }
  });
</script>
</body>
</html>`;
    }
}
