/**
 * Playwright tests for the Armada configuration webview.
 *
 * Renders the real ConfigPanel HTML in headless Chromium and bridges
 * `acquireVsCodeApi().postMessage` to the panel's extension-side handler, so
 * clicking "Test Connection" drives a real ArmadaClient against real gRPC
 * servers on non-default ports.
 *
 * Run with `npm run test:webview`. Requires the Chromium headless shell
 * (`npx playwright install chromium-headless-shell`); the suite skips when it
 * is missing locally and fails when it is missing in CI.
 */
import * as assert from 'assert';
import type { Browser, Page } from 'playwright';
import { installVscodeMock, mockState, FakeWebviewPanel } from '../unit/vscodeMock';
import { tlsFixture } from '../unit/setup/tlsFixture';
import { startGrpcPair, startSilentTcp, GrpcPair, HttpFixture } from '../unit/support/connectionFixtures';
import { knownBug } from '../unit/support/knownBug';
import { ResolvedConfig } from '../../types/config';

installVscodeMock();

const { ConfigPanel } = require('../../panels/configPanel') as typeof import('../../panels/configPanel');
const { ArmadaClient } = require('../../grpc/armadaClient') as typeof import('../../grpc/armadaClient');

// Page-side code runs in the browser; tsconfig has no DOM lib, so go through globalThis.
type AnyGlobal = any;

const WEBVIEW_URL = 'http://webview.test/';
const XSS = `"><img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=2</script>`;

interface Mounted {
    page: Page;
    panel: FakeWebviewPanel;
    errors: string[];
}

describe('ConfigPanel webview (Playwright)', function () {
    this.timeout(60000);

    let browser: Browser | undefined;
    let plain: GrpcPair;
    let secure: GrpcPair | undefined;
    const openPages: Page[] = [];
    const savedConsole = { log: console.log, warn: console.warn, error: console.error };

    before(async function () {
        try {
            const { chromium } = await import('playwright');
            browser = await chromium.launch();
        } catch (e) {
            if (process.env.CI) { throw e; }
            console.warn(`Skipping webview tests: Chromium unavailable (${(e as Error).message.split('\n')[0]})`);
            this.skip();
        }
        console.log = console.warn = console.error = () => undefined;
        plain = await startGrpcPair(false, 'plain');
        if (tlsFixture) { secure = await startGrpcPair(true, 'tls'); }
    });

    afterEach(async () => {
        while (openPages.length) { await openPages.pop()!.close(); }
        mockState.panels.forEach(p => p.dispose());
        mockState.panels.length = 0;
    });

    after(async () => {
        Object.assign(console, savedConsole);
        await browser?.close();
        plain?.stop();
        secure?.stop();
    });

    function cfg(armadaUrl: string, extra: Partial<ResolvedConfig> = {}): ResolvedConfig {
        return { armadaUrl, currentContext: 'ctx', auth: { type: 'none' }, ...extra } as ResolvedConfig;
    }

    async function mount(config: ResolvedConfig | null, withClient = true): Promise<Mounted> {
        ConfigPanel.show(config, withClient && config ? new ArmadaClient(config) : undefined);
        const panel = mockState.panels[mockState.panels.length - 1];
        const page = await browser!.newPage();
        openPages.push(page);
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => { errors.push(`dialog: ${d.message()}`); void d.dismiss(); });

        // webview -> extension host
        await page.exposeFunction('__toHost', (m: unknown) => panel.receive(m));
        await page.addInitScript(() => {
            (globalThis as AnyGlobal).acquireVsCodeApi = () => ({
                postMessage: (m: unknown) => (globalThis as AnyGlobal).__toHost(m),
                getState: () => undefined,
                setState: () => undefined,
            });
        });
        // extension host -> webview
        panel.onPost = m => { void page.evaluate(msg => (globalThis as AnyGlobal).postMessage(msg, '*'), m).catch(() => undefined); };
        // Serve the current panel HTML from a real URL so init scripts run.
        let html = panel.webview.html;
        await page.route(`${WEBVIEW_URL}**`, route => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
        panel.onHtml = h => { html = h; void page.goto(WEBVIEW_URL).catch(() => undefined); };
        await page.goto(WEBVIEW_URL);
        return { page, panel, errors };
    }

    async function clickTest(page: Page, timeout = 15000): Promise<{ cls: string; text: string }> {
        await page.click('#testBtn');
        await page.waitForSelector('#testResult.ok, #testResult.err', { timeout });
        return {
            cls: (await page.getAttribute('#testResult', 'class')) ?? '',
            text: (await page.textContent('#testResult')) ?? '',
        };
    }

    async function serverUrlShown(page: Page): Promise<string | null> {
        return page.locator('.row', { hasText: 'Server URL' }).locator('.value').textContent();
    }

    describe('Test Connection across URL forms and non-default ports', () => {
        const cases: Array<[string, () => string | undefined]> = [
            ['bare localhost:port', () => `localhost:${plain.armadaPort}`],
            ['http://127.0.0.1:port', () => `http://127.0.0.1:${plain.armadaPort}`],
            ['IPv6 [::1]:port', () => (plain.ipv6 ? `[::1]:${plain.armadaPort}` : undefined)],
            ['dns:///localhost:port', () => `dns:///localhost:${plain.armadaPort}`],
            ['https://localhost:port (TLS)', () => (secure ? `https://localhost:${secure.armadaPort}` : undefined)],
        ];
        for (const [title, url] of cases) {
            it(`${title} → ✓ Connected`, async function () {
                const u = url();
                if (!u) { this.skip(); }
                const { page, errors } = await mount(cfg(u!));
                assert.strictEqual(await serverUrlShown(page), u);
                const r = await clickTest(page);
                assert.strictEqual(r.cls, 'ok', r.text);
                assert.match(r.text, /✓ Connected · 2 active queues found/);
                assert.strictEqual(await page.isDisabled('#testBtn'), false, 'button re-enabled');
                assert.strictEqual(await page.isVisible('#spinner'), false, 'spinner hidden');
                assert.deepStrictEqual(errors, []);
            });
        }

        it('TLS server addressed without scheme → ✗ error message', async function () {
            if (!secure) { this.skip(); }
            const { page } = await mount(cfg(`localhost:${secure!.armadaPort}`));
            const r = await clickTest(page);
            assert.strictEqual(r.cls, 'err');
            assert.match(r.text, /^✗ /);
        });

        knownBug('armada-vscode-6ts', 'trailing slash URL connects from the panel', async () => {
            const { page } = await mount(cfg(`http://localhost:${plain.armadaPort}/`));
            const r = await clickTest(page);
            assert.strictEqual(r.cls, 'ok', r.text);
        });
    });

    describe('hung endpoint', () => {
        let silent: HttpFixture;
        before(async () => { silent = await startSilentTcp(); });
        after(() => silent?.stop());

        // Regression test for armada-vscode-1eb.
        it('spinner settles with a timeout message when the server never responds', async function () {
            this.timeout(25000);
            const { page } = await mount(cfg(`127.0.0.1:${silent.port}`));
            const r = await clickTest(page, 15000);
            assert.strictEqual(r.cls, 'err');
            assert.match(r.text, /Timed out after 10s/);
            assert.strictEqual(await page.isDisabled('#testBtn'), false, 'button re-enabled');
            assert.strictEqual(await page.isVisible('#spinner'), false, 'spinner hidden');
        });
    });

    describe('rendering and escaping', () => {
        it('renders hostile values as text in every field without executing them', async () => {
            const { page, errors } = await mount(cfg(`https://a.example:8443/?q=1&x=<b>${XSS}`, {
                currentContext: XSS,
                binocularsUrl: XSS,
                binocularsUrlPattern: `{CLUSTER_ID}${XSS}`,
                lookoutUrl: XSS,
                auth: { type: 'basic', credentials: { username: XSS, password: 'pw' } } as ResolvedConfig['auth'],
            }), false);
            await page.waitForTimeout(200);
            assert.strictEqual(await page.evaluate(() => (globalThis as AnyGlobal).__pwned), undefined);
            assert.strictEqual(await page.locator('img').count(), 0);
            const values = await page.locator('.value').allTextContents();
            for (const label of ['Context', 'Binoculars URL', 'Lookout URL']) {
                assert.strictEqual(await page.locator('.row', { hasText: label }).first().locator('.value').textContent(), XSS, label);
            }
            assert.ok(values.some(v => v.includes('&x=<b>')), 'query string shown verbatim');
            assert.deepStrictEqual(errors, []);
        });

        it('sets a nonce-based Content-Security-Policy', async () => {
            const { page } = await mount(cfg(`localhost:${plain.armadaPort}`));
            const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
            assert.match(csp ?? '', /default-src 'none'/);
            assert.match(csp ?? '', /script-src 'nonce-[^']+'/);
        });
    });

    describe('secrets', () => {
        const creds = { username: 'alice', password: `p"a'ss<>&`, 'api"key': 'k1', 'my token': 't2' };
        for (const key of ['password', 'api"key', 'my token'] as const) {
            it(`masks, reveals and re-hides ${JSON.stringify(key)}`, async () => {
                const { page } = await mount(cfg(`localhost:${plain.armadaPort}`, {
                    auth: { type: 'basic', credentials: creds } as ResolvedConfig['auth'],
                }), false);
                const button = page.locator(`button.inline-btn[data-key=${JSON.stringify(key)}]`);
                const plainText = () => page.evaluate(k => {
                    const el = (globalThis as AnyGlobal).document.getElementById('plain-' + k);
                    return { text: el?.textContent, hidden: el?.classList.contains('hidden') };
                }, key);

                assert.strictEqual(await button.textContent(), 'Show');
                assert.deepStrictEqual(await plainText(), { text: '', hidden: true });

                await button.click();
                await page.waitForFunction(k => (globalThis as AnyGlobal).document.getElementById('toggle-' + k)?.textContent === 'Hide', key);
                assert.deepStrictEqual(await plainText(), { text: creds[key], hidden: false });

                await button.click();
                assert.strictEqual(await button.textContent(), 'Show');
                assert.strictEqual((await plainText()).hidden, true);
            });
        }

        it('does not mask non-secret fields', async () => {
            const { page } = await mount(cfg(`localhost:${plain.armadaPort}`, {
                auth: { type: 'basic', credentials: creds } as ResolvedConfig['auth'],
            }), false);
            assert.strictEqual(await page.locator('.row', { hasText: 'username' }).locator('.value').textContent(), 'alice');
        });
    });

    describe('panel lifecycle', () => {
        it('reports an error when no client is initialised', async () => {
            const { page } = await mount(cfg(`localhost:${plain.armadaPort}`), false);
            const r = await clickTest(page);
            assert.strictEqual(r.cls, 'err');
            assert.match(r.text, /not initialized/);
        });

        it('shows setup guidance when there is no config', async () => {
            const { page } = await mount(null, false);
            assert.match((await page.textContent('body')) ?? '', /No Armada configuration found/);
        });

        knownBug('armada-vscode-qno', 'no script errors when there is no config', async () => {
            const { page, errors } = await mount(null, false);
            await page.waitForTimeout(200);
            assert.deepStrictEqual(errors, []);
        });

        it('re-showing the singleton with a new context uses the new client', async () => {
            // Start on a context that cannot connect (plaintext client vs TLS-only port, or a closed port).
            const badUrl = secure ? `localhost:${secure.armadaPort}` : 'localhost:1';
            const { page, panel } = await mount(cfg(badUrl, { currentContext: 'bad' }));
            const good = cfg(`localhost:${plain.armadaPort}`, { currentContext: 'good' });
            ConfigPanel.show(good, new ArmadaClient(good));
            await page.waitForFunction(() => (globalThis as AnyGlobal).document.body.textContent.includes('good'));
            const r = await clickTest(page);
            assert.strictEqual(r.cls, 'ok', r.text);
            assert.strictEqual(panel.revealCount, 1);
            assert.strictEqual(mockState.panels.length, 1, 'singleton: no second panel created');
        });

        it('a double click sends a single probe', async () => {
            const { page, panel } = await mount(cfg(`localhost:${plain.armadaPort}`));
            await page.evaluate(() => {
                const b = (globalThis as AnyGlobal).document.getElementById('testBtn');
                b.click();
                b.click();
            });
            await page.waitForSelector('#testResult.ok, #testResult.err');
            await page.waitForTimeout(300);
            const results = panel.outbox.filter(m => (m as { command?: string }).command === 'testResult');
            assert.strictEqual(results.length, 1);
        });
    });
});
