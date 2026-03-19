import * as vscode from 'vscode';
import { ArmadaClient } from '../grpc/armadaClient';
import { JobInfo } from '../types/armada';

export class JobDetailPanel {
    private static panels = new Map<string, JobDetailPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly jobId: string;
    private disposables: vscode.Disposable[] = [];

    static show(jobInfo: JobInfo, client: ArmadaClient): void {
        if (JobDetailPanel.panels.has(jobInfo.jobId)) {
            JobDetailPanel.panels.get(jobInfo.jobId)!.panel.reveal();
            return;
        }
        new JobDetailPanel(jobInfo, client);
    }

    private constructor(jobInfo: JobInfo, client: ArmadaClient) {
        this.jobId = jobInfo.jobId;

        this.panel = vscode.window.createWebviewPanel(
            'armadaJobDetail',
            `Job: ${jobInfo.jobId.substring(0, 8)}…`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: false,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        JobDetailPanel.panels.set(this.jobId, this);

        this.panel.onDidDispose(() => {
            JobDetailPanel.panels.delete(this.jobId);
            this.disposables.forEach(d => d.dispose());
        }, null, this.disposables);

        this.panel.webview.html = this.loadingHtml(jobInfo);
        this.fetchAndRender(jobInfo, client);
    }

    private async fetchAndRender(jobInfo: JobInfo, client: ArmadaClient): Promise<void> {
        try {
            const detailsMap = await client.getJobDetails([jobInfo.jobId], true, true);
            const details = detailsMap.get(jobInfo.jobId);
            this.panel.webview.html = this.renderHtml(jobInfo, details);
        } catch (error: any) {
            this.panel.webview.html = this.errorHtml(jobInfo, error.message);
        }
    }

    private loadingHtml(jobInfo: JobInfo): string {
        return this.wrapHtml(`
            <h2>Job: ${esc(jobInfo.jobId)}</h2>
            <p style="color: var(--vscode-descriptionForeground);">Loading details…</p>
        `);
    }

    private errorHtml(jobInfo: JobInfo, message: string): string {
        return this.wrapHtml(`
            <h2>Job: ${esc(jobInfo.jobId)}</h2>
            <p style="color: var(--vscode-errorForeground);">Failed to load details: ${esc(message)}</p>
            <p style="color: var(--vscode-descriptionForeground);">The Query API may not be available on this cluster.</p>
            <table>
                <tr><th>Queue</th><td>${esc(jobInfo.queue)}</td></tr>
                <tr><th>Job Set</th><td>${esc(jobInfo.jobSetId)}</td></tr>
                <tr><th>State</th><td>${esc(jobInfo.state)}</td></tr>
                ${jobInfo.failureReason ? `<tr><th>Failure</th><td style="color: var(--vscode-errorForeground);">${esc(jobInfo.failureReason)}</td></tr>` : ''}
            </table>
        `);
    }

    private renderHtml(jobInfo: JobInfo, details: any): string {
        const runs: any[] = details?.job_runs ?? details?.jobRuns ?? [];
        const jobSpec = details?.job_spec ?? details?.jobSpec;

        // Explicit allow-list of fields to render — no object spreading
        const submittedTs = details?.submitted_ts ?? details?.submittedTs;
        const lastTransitionTs = details?.last_transition_ts ?? details?.lastTransitionTs;
        const owner = details?.owner;

        const runsHtml = runs.length > 0 ? `
            <h3>Run History</h3>
            <table>
                <thead>
                    <tr><th>#</th><th>Cluster</th><th>Node</th><th>Started</th><th>Finished</th><th>Exit Code</th></tr>
                </thead>
                <tbody>
                    ${runs.map((run: any, i: number) => {
                        const cluster = esc(run.cluster ?? run.clusterId ?? '—');
                        const node = esc(run.node ?? '—');
                        const started = esc(run.started_ts ?? run.startedTs ?? run.started ?? '—');
                        const finished = esc(run.finished_ts ?? run.finishedTs ?? run.finished ?? '—');
                        const exitCode = run.exit_code ?? run.exitCode;
                        const exitCodeStr = exitCode !== undefined ? String(exitCode) : '—';
                        const exitStyle = exitCode !== undefined && exitCode !== 0
                            ? 'color: var(--vscode-errorForeground);'
                            : '';
                        return `<tr>
                            <td>${i}</td>
                            <td>${cluster}</td>
                            <td>${node}</td>
                            <td>${started}</td>
                            <td>${finished}</td>
                            <td style="${exitStyle}">${esc(exitCodeStr)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        ` : '<p style="color: var(--vscode-descriptionForeground);">No run history available.</p>';

        const resourcesHtml = jobSpec ? (() => {
            const reqs = jobSpec.scheduling_resource_requirements ?? jobSpec.schedulingResourceRequirements;
            if (!reqs) { return ''; }
            const cpu = esc(reqs.cpu ?? reqs.CPU ?? '—');
            const memory = esc(reqs.memory ?? reqs.Memory ?? '—');
            const gpu = esc(reqs.gpu ?? reqs['nvidia.com/gpu'] ?? '—');
            return `
                <h3>Resource Requests</h3>
                <table>
                    <tr><th>CPU</th><td>${cpu}</td></tr>
                    <tr><th>Memory</th><td>${memory}</td></tr>
                    <tr><th>GPU</th><td>${gpu}</td></tr>
                </table>
            `;
        })() : '';

        return this.wrapHtml(`
            <h2>Job: ${esc(jobInfo.jobId)}</h2>

            <h3>Identity</h3>
            <table>
                <tr><th>Job ID</th><td><code>${esc(jobInfo.jobId)}</code></td></tr>
                <tr><th>Queue</th><td>${esc(jobInfo.queue)}</td></tr>
                <tr><th>Job Set</th><td>${esc(jobInfo.jobSetId)}</td></tr>
                ${owner ? `<tr><th>Owner</th><td>${esc(owner)}</td></tr>` : ''}
                ${jobInfo.namespace ? `<tr><th>Namespace</th><td>${esc(jobInfo.namespace)}</td></tr>` : ''}
                ${jobInfo.priority !== undefined ? `<tr><th>Priority</th><td>${esc(String(jobInfo.priority))}</td></tr>` : ''}
            </table>

            <h3>State</h3>
            <table>
                <tr><th>Current State</th><td>${esc(jobInfo.state)}</td></tr>
                ${jobInfo.failureReason ? `<tr><th>Failure Reason</th><td style="color: var(--vscode-errorForeground);">${esc(jobInfo.failureReason)}</td></tr>` : ''}
                ${submittedTs ? `<tr><th>Submitted</th><td>${esc(String(submittedTs))}</td></tr>` : ''}
                ${lastTransitionTs ? `<tr><th>Last Transition</th><td>${esc(String(lastTransitionTs))}</td></tr>` : ''}
            </table>

            ${resourcesHtml}
            ${runsHtml}
        `);
    }

    private wrapHtml(body: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            padding: 16px;
            line-height: 1.5;
        }
        h2 { color: var(--vscode-titleBar-activeForeground, var(--vscode-editor-foreground)); font-size: 1.2em; margin-top: 0; }
        h3 { font-size: 1em; margin-top: 20px; margin-bottom: 6px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
        th { text-align: left; padding: 4px 12px 4px 0; color: var(--vscode-descriptionForeground); font-weight: normal; white-space: nowrap; width: 140px; }
        td { padding: 4px 0; }
        thead th { color: var(--vscode-editor-foreground); font-weight: bold; border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: 6px; width: auto; }
        code { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
    </style>
</head>
<body>
    ${body}
</body>
</html>`;
    }
}

/** HTML-escape a string to prevent XSS in webview content */
function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
