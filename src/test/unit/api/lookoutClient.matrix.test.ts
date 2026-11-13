/**
 * LookoutClient against real HTTP/HTTPS servers on non-default ports.
 * `knownBug()` cases document armada-vscode-ofj and flip when it's fixed.
 */
import * as assert from 'assert';
import { LookoutClient, LookoutJob } from '../../../api/lookoutClient';
import { tlsFixture } from '../setup/tlsFixture';
import { startLookout, startBadGateway, startSilentTcp, HttpFixture, UNICODE_OWNER } from '../support/connectionFixtures';
import { knownBug, within } from '../support/knownBug';

const REQUEST = { filters: [], order: { field: 'submitted', direction: 'DESC' as const }, take: 1 };

function fetchJobs(lookoutUrl: string, ms = 5000): Promise<LookoutJob[]> {
    return within(new LookoutClient({ lookoutUrl }).getJobs(REQUEST), ms, `getJobs(${lookoutUrl})`);
}

/** The fixture echoes the request path into jobSet as "path:<url>". */
async function requestedPath(lookoutUrl: string): Promise<string> {
    const jobs = await fetchJobs(lookoutUrl);
    return jobs[0].jobSet.replace(/^path:/, '');
}

describe('LookoutClient (real HTTP, non-default ports)', function () {
    this.timeout(20000);

    let plain: HttpFixture;
    let secure: HttpFixture | undefined;
    let badGateway: HttpFixture;
    let silent: HttpFixture;

    before(async () => {
        plain = await startLookout(false);
        if (tlsFixture) { secure = await startLookout(true); }
        badGateway = await startBadGateway();
        silent = await startSilentTcp();
    });

    after(async () => {
        await plain?.stop();
        await secure?.stop();
        await badGateway?.stop();
        await silent?.stop();
    });

    describe('URL forms route to /api/v1/jobs', () => {
        const API = '/api/v1/jobs?backend=jsonb';

        it('http://localhost:port', async () => assert.strictEqual(await requestedPath(`http://localhost:${plain.port}`), API));
        it('http://127.0.0.1:port', async () => assert.strictEqual(await requestedPath(`http://127.0.0.1:${plain.port}`), API));
        it('single trailing slash is stripped', async () => assert.strictEqual(await requestedPath(`http://localhost:${plain.port}/`), API));
        it('uppercase scheme and host', async () => assert.strictEqual(await requestedPath(`HTTP://LOCALHOST:${plain.port}`), API));
        it('base path behind a reverse proxy is preserved', async () =>
            assert.strictEqual(await requestedPath(`http://localhost:${plain.port}/lookout`), `/lookout${API}`));
        it('https://localhost:port with TLS', async function () {
            if (!secure) { this.skip(); }
            assert.strictEqual(await requestedPath(`https://localhost:${secure!.port}`), API);
        });
    });

    knownBug('armada-vscode-ofj', 'multi-byte UTF-8 split across chunks is decoded intact', async () => {
        const jobs = await fetchJobs(`http://localhost:${plain.port}`);
        assert.strictEqual(jobs[0].owner, UNICODE_OWNER);
    });

    knownBug('armada-vscode-ofj', 'IPv6 literal http://[::1]:port', async () => {
        assert.ok((await fetchJobs(`http://[::1]:${plain.port}`)).length > 0);
    });

    knownBug('armada-vscode-ofj', 'scheme-less localhost:port reaches the configured port', async () => {
        // Currently parsed as protocol "localhost:" and sent to port 80.
        assert.ok((await fetchJobs(`localhost:${plain.port}`, 3000)).length > 0);
    });

    knownBug('armada-vscode-ofj', 'non-2xx responses report the HTTP status', async () => {
        await assert.rejects(fetchJobs(`http://localhost:${badGateway.port}`), /502/);
    });

    knownBug('armada-vscode-ofj', 'a server that never responds is rejected within 10s', async () => {
        await assert.rejects(fetchJobs(`http://localhost:${silent.port}`, 10000), (e: Error) => !/did not settle/.test(e.message));
    }, 15000);
});
