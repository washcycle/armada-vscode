/**
 * Builds a VS Code status bar label showing live job counts using inline codicons.
 * Zero-count states are suppressed. Returns $(dash) when all counts are zero.
 */
export function buildJobCountLabel(counts: Record<string, number>): string {
    const segments: string[] = [];

    const running = counts['RUNNING'] ?? 0;
    const failed  = counts['FAILED']  ?? 0;
    const queued  = (counts['QUEUED'] ?? 0) + (counts['PENDING'] ?? 0);

    if (running > 0) { segments.push(`$(play) ${running}`); }
    if (failed  > 0) { segments.push(`$(error) ${failed}`); }
    if (queued  > 0) { segments.push(`$(clock) ${queued}`); }

    return segments.length === 0 ? '$(dash)' : segments.join('  ');
}

/** Display order for the tooltip breakdown; unknown states are appended alphabetically. */
const STATE_ORDER = ['RUNNING', 'FAILED', 'QUEUED', 'PENDING', 'SUCCEEDED', 'CANCELLED', 'PREEMPTED'];

/**
 * Builds the job count tooltip: the active context followed by one line per
 * non-zero state (spec: "identify the active context and list counts per state").
 */
export function buildJobCountTooltip(contextName: string, counts: Record<string, number>): string {
    const header = `Armada [${contextName}]`;
    const states = Object.keys(counts)
        .filter(s => (counts[s] ?? 0) > 0)
        .sort((a, b) => {
            const ia = STATE_ORDER.indexOf(a), ib = STATE_ORDER.indexOf(b);
            if (ia === -1 && ib === -1) { return a.localeCompare(b); }
            if (ia === -1) { return 1; }
            if (ib === -1) { return -1; }
            return ia - ib;
        });

    if (states.length === 0) {
        return `${header}: no monitored jobs`;
    }

    const lines = states.map(s => `${s.charAt(0)}${s.slice(1).toLowerCase()}: ${counts[s]}`);
    return [header, ...lines].join('\n');
}

/**
 * The job count item is shown only when the extension is configured and the
 * `armada.statusBar.showJobCounts` setting is enabled.
 */
export function shouldShowJobCounts(configured: boolean, settingEnabled: boolean): boolean {
    return configured && settingEnabled;
}
