/**
 * Expected-failure ("xfail") helper.
 *
 * Registers a test that documents a known bug: it PASSES while the bug is
 * present (the body throws) and FAILS once the body stops throwing, prompting
 * whoever fixed the bug to convert it into a normal `it()`.
 */
export function knownBug(issueId: string, title: string, body: () => Promise<void> | void, timeoutMs?: number): void {
    it(`[known bug ${issueId}] ${title}`, async function () {
        if (timeoutMs) { this.timeout(timeoutMs); }
        let failed = false;
        try {
            await body();
        } catch {
            failed = true;
        }
        if (!failed) {
            throw new Error(`Expected failure no longer fails — ${issueId} looks fixed. Convert this knownBug() into a regular it().`);
        }
    });
}

/** Reject if `promise` doesn't settle within `ms`. */
export function within<T>(promise: Promise<T>, ms: number, what = 'operation'): Promise<T> {
    let timer: NodeJS.Timeout;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms}ms`)), ms); }),
    ]);
}
