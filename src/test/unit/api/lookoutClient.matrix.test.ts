/**
 * LookoutClient against real HTTP/HTTPS servers on non-default ports.
 * Includes regression tests for armada-vscode-ofj (encoding, IPv6, scheme-less URLs, status, timeout).
 */
import * as assert from 'assert';
import { LookoutClient, LookoutJob, normalizeLookoutUrl } from '../../../api/lookoutClient';
import { tlsFixture } from '../setup/tlsFixture';
import { startLookout, startBadGateway, startSilentTcp, HttpFixture, UNICODE_OWNER } from '../support/connectionFixtures';
import { within } from '../support/knownBug';

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

    // Regression tests for armada-vscode-ofj.
    it('decodes multi-byte UTF-8 split across chunks intact', async () => {
        const jobs = await fetchJobs(`http://localhost:${plain.port}`);
        assert.strictEqual(jobs[0].owner, UNICODE_OWNER);
    });

    it('reaches an IPv6 literal http://[::1]:port', async function () {
        const jobs = await fetchJobs(`http://[::1]:${plain.port}`).catch(e => {
            if (/EADDRNOTAVAIL|ENETUNREACH|EAFNOSUPPORT/.test(String(e))) { this.skip(); }
            throw e;
        });
        assert.ok(jobs.length > 0);
    });

    it('sends a scheme-less localhost:port URL to that port over http', async () => {
        assert.strictEqual(await requestedPath(`localhost:${plain.port}`), '/api/v1/jobs?backend=jsonb');
    });

    it('tolerates surrounding whitespace and several trailing slashes', async () => {
        assert.strictEqual(await requestedPath(`  http://localhost:${plain.port}///  `), '/api/v1/jobs?backend=jsonb');
    });

    it('reports the HTTP status for non-2xx responses', async () => {
        await assert.rejects(fetchJobs(`http://localhost:${badGateway.port}`), /HTTP 502.*Bad Gateway/);
    });

    it('rejects with a timeout when the server never responds', async () => {
        const client = new LookoutClient({ lookoutUrl: `http://localhost:${silent.port}`, timeoutMs: 500 });
        await assert.rejects(within(client.getJobs(REQUEST), 5000, 'getJobs'), /did not respond within/);
    });
});

describe('normalizeLookoutUrl', () => {
    const cases: Array<[string, string]> = [
        ['http://lookout.example.com', 'http://lookout.example.com'],
        ['https://lookout.example.com/', 'https://lookout.example.com'],
        ['https://lookout.example.com/base//', 'https://lookout.example.com/base'],
        ['  https://lookout.example.com  ', 'https://lookout.example.com'],
        ['localhost:30000', 'http://localhost:30000'],
        ['127.0.0.1:30000', 'http://127.0.0.1:30000'],
        ['[::1]:30000', 'http://[::1]:30000'],
        ['lookout.example.com', 'https://lookout.example.com'],
        ['lookout.example.com:8080/lookout', 'https://lookout.example.com:8080/lookout'],
    ];
    for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} → ${expected}`, () => {
            assert.strictEqual(normalizeLookoutUrl(input), expected);
        });
    }
});
