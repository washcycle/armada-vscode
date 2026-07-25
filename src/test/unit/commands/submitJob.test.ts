import * as assert from 'assert';
import { installVscodeMock, vscodeMock } from '../vscodeMock';

const shownInfo: string[] = [];
const shownWarnings: string[] = [];
const shownErrors: string[] = [];

installVscodeMock();

/**
 * The vscode mock is shared and other suites replace these spies at module load,
 * so install ours per test and put the originals back afterwards.
 */
function installSpies(): void {
    (vscodeMock.window as any).showInformationMessage = async (msg: string, ...actions: string[]) => {
        shownInfo.push(msg);
        // Auto-confirm the submission prompt; plain notifications take no action.
        return actions.includes('Submit') ? 'Submit' : undefined;
    };
    (vscodeMock.window as any).showWarningMessage = async (msg: string) => { shownWarnings.push(msg); return undefined; };
    (vscodeMock.window as any).showErrorMessage = async (msg: string) => { shownErrors.push(msg); return undefined; };
}

// Import AFTER the mock is in place.
const { submitJobCommand, findJobsWithoutPodSpec } = require('../../../commands/submitJob');

function setActiveYaml(content: string): void {
    (vscodeMock.window as any).activeTextEditor = {
        document: {
            languageId: 'yaml',
            fileName: '/tmp/job.yml',
            getText: () => content
        }
    };
}

function makeClient(response: any, error?: Error) {
    const calls: any[] = [];
    return {
        calls,
        submitJobs: async (spec: any) => {
            calls.push(spec);
            if (error) { throw error; }
            return response;
        }
    };
}

function makeTree() {
    const added: any[] = [];
    return { added, addJob: (job: any) => added.push(job) };
}

const CONFIG_MANAGER = {} as any;

describe('findJobsWithoutPodSpec', () => {
    const containers = [{ name: 'c', image: 'busybox' }];

    it('accepts the singular podSpec form', () => {
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ podSpec: { containers } }]), []);
    });

    it('accepts the plural list form', () => {
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ podSpecs: [{ containers }] }]), []);
    });

    it('accepts a bare mapping under the plural key', () => {
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ podSpecs: { containers } }]), []);
    });

    it('flags a job with no pod spec at all', () => {
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ namespace: 'apqx' }]), [0]);
    });

    it('flags a pod spec with no containers', () => {
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ podSpec: { restartPolicy: 'Never' } }]), [0]);
        assert.deepStrictEqual(findJobsWithoutPodSpec([{ podSpec: { containers: [] } }]), [0]);
    });

    it('reports only the offending indices', () => {
        assert.deepStrictEqual(
            findJobsWithoutPodSpec([
                { podSpec: { containers } },
                { namespace: 'apqx' },
                { podSpecs: [{ containers }] },
                null
            ]),
            [1, 3]
        );
    });
});

describe('submitJobCommand', () => {
    let originalWindow: Record<string, unknown>;

    beforeEach(() => {
        shownInfo.length = 0;
        shownWarnings.length = 0;
        shownErrors.length = 0;
        // Snapshot per test, not at load: other suites install their own spies
        // while files are being loaded, and restoring a load-time snapshot would
        // wipe them.
        originalWindow = { ...(vscodeMock.window as any) };
        installSpies();
    });

    afterEach(() => {
        Object.assign(vscodeMock.window as any, originalWindow);
    });

    const VALID_YAML = `
queue: apqx
jobSetId: js-1
jobs:
  - namespace: apqx
    podSpec:
      containers:
        - name: c
          image: busybox
`;

    it('submits a valid file and reports success', async () => {
        setActiveYaml(VALID_YAML);
        const client = makeClient({ jobIds: ['job-1'], rejected: [] });
        const tree = makeTree();

        await submitJobCommand(client, CONFIG_MANAGER, tree);

        assert.strictEqual(client.calls.length, 1);
        assert.strictEqual(tree.added.length, 1);
        assert.strictEqual(tree.added[0].jobId, 'job-1');
        assert.deepStrictEqual(shownErrors, []);
        assert.ok(
            shownInfo.some(m => /Successfully submitted 1 job to Armada/.test(m)),
            `expected a singular success message, got: ${shownInfo.join(' | ')}`
        );
    });

    it('refuses to submit a job with no pod spec, naming the job and the field', async () => {
        // Without this the server answers "Job must contain at least one PodSpec",
        // which names neither the job nor the key to fix.
        setActiveYaml(`
queue: apqx
jobSetId: js-1
jobs:
  - namespace: apqx
    containers:
      - name: c
        image: busybox
`);
        const client = makeClient({ jobIds: [], rejected: [] });

        await submitJobCommand(client, CONFIG_MANAGER, makeTree());

        assert.strictEqual(client.calls.length, 0, 'must not reach the server');
        assert.strictEqual(shownErrors.length, 1);
        assert.match(shownErrors[0], /jobs\[0\]/);
        assert.match(shownErrors[0], /podSpec/);
    });

    it('names every offending job when several lack pod specs', async () => {
        setActiveYaml(`
queue: apqx
jobSetId: js-1
jobs:
  - namespace: apqx
  - namespace: apqx
    podSpec:
      containers:
        - name: c
          image: busybox
  - namespace: apqx
    podSpec: {}
`);
        const client = makeClient({ jobIds: [], rejected: [] });

        await submitJobCommand(client, CONFIG_MANAGER, makeTree());

        assert.strictEqual(client.calls.length, 0);
        assert.match(shownErrors[0], /jobs\[0\], jobs\[2\]/);
    });

    it('warns on a partial rejection instead of claiming full success', async () => {
        setActiveYaml(VALID_YAML);
        const client = makeClient({
            jobIds: ['job-1'],
            rejected: [{ index: 1, error: 'namespace "nope" is not permitted for this user' }]
        });
        const tree = makeTree();

        await submitJobCommand(client, CONFIG_MANAGER, tree);

        assert.deepStrictEqual(shownErrors, []);
        assert.strictEqual(shownWarnings.length, 1, `expected one warning, got ${shownWarnings.join(' | ')}`);
        assert.match(shownWarnings[0], /jobs\[1\]/);
        assert.match(shownWarnings[0], /not permitted/);
        assert.ok(
            !shownInfo.some(m => /Successfully submitted/.test(m)),
            'a partial failure must not be reported as a success'
        );
        // Only the accepted job belongs in the tree; a rejected one never resolves.
        assert.strictEqual(tree.added.length, 1);
        assert.strictEqual(tree.added[0].jobId, 'job-1');
    });

    it('errors and adds nothing when every job is rejected', async () => {
        setActiveYaml(VALID_YAML);
        const client = makeClient({
            jobIds: [],
            rejected: [{ index: 0, error: 'Job must contain at least one PodSpec' }]
        });
        const tree = makeTree();

        await submitJobCommand(client, CONFIG_MANAGER, tree);

        assert.strictEqual(shownErrors.length, 1);
        assert.match(shownErrors[0], /rejected by Armada/);
        assert.strictEqual(tree.added.length, 0);
        assert.strictEqual(shownWarnings.length, 0);
    });

    it('surfaces a call-level failure', async () => {
        setActiveYaml(VALID_YAML);
        const client = makeClient(undefined, new Error('UNAVAILABLE from localhost:50051'));

        await submitJobCommand(client, CONFIG_MANAGER, makeTree());

        assert.strictEqual(shownErrors.length, 1);
        assert.match(shownErrors[0], /UNAVAILABLE/);
    });
});
