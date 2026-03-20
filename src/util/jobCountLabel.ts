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
