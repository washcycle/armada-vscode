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
        const submittedTs = formatTimestamp(details?.submitted_ts ?? details?.submittedTs);
        const lastTransitionTs = formatTimestamp(details?.last_transition_ts ?? details?.lastTransitionTs);
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
                        const started = esc(formatTimestamp(run.started_ts ?? run.startedTs ?? run.started) ?? '—');
                        const finished = esc(formatTimestamp(run.finished_ts ?? run.finishedTs ?? run.finished) ?? '—');
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
            const cpu = esc(formatQuantity(reqs.cpu ?? reqs.CPU) ?? '—');
            const memory = esc(formatQuantity(reqs.memory ?? reqs.Memory) ?? '—');
            const gpu = esc(formatQuantity(reqs.gpu ?? reqs['nvidia.com/gpu']) ?? '—');
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
                ${submittedTs ? `<tr><th>Submitted</th><td>${esc(submittedTs)}</td></tr>` : ''}
                ${lastTransitionTs ? `<tr><th>Last Transition</th><td>${esc(lastTransitionTs)}</td></tr>` : ''}
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

/**
 * Format a protobuf Timestamp for display.
 *
 * The gRPC clients load protos with `longs: String`, so a
 * `google.protobuf.Timestamp` arrives as `{seconds: "1785...", nanos: 0}` —
 * interpolating that straight into HTML renders "[object Object]". Lookout's
 * REST API returns the same instants as ISO strings, so both shapes reach here.
 *
 * Returns undefined when there is no usable value, so callers can omit the row.
 */
export function formatTimestamp(ts: unknown): string | undefined {
    if (ts === null || ts === undefined || ts === '') { return undefined; }

    // Already a string: an ISO date from Lookout, or a stringified epoch.
    if (typeof ts === 'string') {
        const asNumber = Number(ts);
        if (Number.isFinite(asNumber) && ts.trim() !== '') {
            return fromEpochSeconds(asNumber);
        }
        const parsed = Date.parse(ts);
        return Number.isNaN(parsed) ? ts : new Date(parsed).toISOString();
    }

    if (typeof ts === 'number') { return fromEpochSeconds(ts); }

    if (ts instanceof Date) {
        return Number.isNaN(ts.getTime()) ? undefined : ts.toISOString();
    }

    if (typeof ts === 'object') {
        const obj = ts as Record<string, unknown>;
        // protobuf Timestamp: {seconds, nanos}. Either may be string or number,
        // and `defaults: true` means a zero-value timestamp still has both keys.
        if ('seconds' in obj || 'nanos' in obj) {
            const seconds = Number(obj.seconds ?? 0);
            const nanos = Number(obj.nanos ?? 0);
            if (!Number.isFinite(seconds) || !Number.isFinite(nanos)) { return undefined; }
            // A genuinely unset timestamp is the epoch; showing 1970 is noise.
            if (seconds === 0 && nanos === 0) { return undefined; }
            return fromEpochSeconds(seconds + nanos / 1e9);
        }
    }

    return undefined;
}

/** Convert epoch seconds to an ISO string, rejecting values Date cannot represent. */
function fromEpochSeconds(seconds: number): string | undefined {
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Format a k8s `resource.Quantity` for display.
 *
 * The generated proto models Quantity as `{string: "900m"}` (a message with a
 * single `string` field), so interpolating it renders "[object Object]".
 * Lookout's REST API sends plain strings/numbers for the same values.
 */
export function formatQuantity(q: unknown): string | undefined {
    if (q === null || q === undefined || q === '') { return undefined; }
    if (typeof q === 'string') { return q; }
    if (typeof q === 'number') { return String(q); }
    if (typeof q === 'object') {
        const inner = (q as Record<string, unknown>).string;
        if (typeof inner === 'string' && inner !== '') { return inner; }
        if (typeof inner === 'number') { return String(inner); }
    }
    return undefined;
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
