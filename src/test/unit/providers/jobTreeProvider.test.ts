/**
 * Unit tests for JobTreeProvider.getJobCounts() and buildJobCountLabel().
 *
 * JobTreeProvider imports the `vscode` module, which is not available outside
 * the VS Code runtime.  We use the shared installVscodeMock() helper to inject
 * a complete stub before loading the provider so that the tests run under plain mocha.
 *
 * IMPORTANT: TypeScript compiles ES `import` declarations to `require()` calls
 * that are hoisted to the top of the emitted file. To ensure the vscode stub is
 * in place before any provider modules are loaded, we use `require()` for all
 * modules that transitively depend on `vscode`.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

import * as assert from 'assert';
import { JobInfo, JobState } from '../../../types/armada';
import { installVscodeMock, uninstallVscodeMock } from '../vscodeMock';

// Install the shared complete vscode mock before loading any vscode-dependent modules
installVscodeMock();

// ---------------------------------------------------------------------------
// Load modules under test AFTER the stub is registered
// ---------------------------------------------------------------------------
// We use require() here (not import) because TypeScript hoists import
// statements to the top of the emitted file, before stub setup runs.
const { JobTreeProvider } = require('../../../providers/jobTreeProvider') as typeof import('../../../providers/jobTreeProvider');
const { buildJobCountLabel } = require('../../../util/jobCountLabel') as typeof import('../../../util/jobCountLabel');

// ---------------------------------------------------------------------------
// Helper: build a minimal JobInfo
// ---------------------------------------------------------------------------
function makeJobInfo(jobId: string, queue: string, jobSetId: string, state: JobState): JobInfo {
    return { jobId, queue, jobSetId, state };
}

// ---------------------------------------------------------------------------
// Tests for JobTreeProvider.getJobCounts()
// ---------------------------------------------------------------------------
describe('JobTreeProvider.getJobCounts()', () => {
    it('returns {} when no jobs have been added', () => {
        const provider = new JobTreeProvider(undefined);
        const counts = provider.getJobCounts();
        assert.deepStrictEqual(counts, {});
    });

    it('counts jobs correctly across mixed states', () => {
        const provider = new JobTreeProvider(undefined);

        provider.addJob(makeJobInfo('j1', 'q', 'set1', JobState.RUNNING));
        provider.addJob(makeJobInfo('j2', 'q', 'set1', JobState.RUNNING));
        provider.addJob(makeJobInfo('j3', 'q', 'set1', JobState.FAILED));
        provider.addJob(makeJobInfo('j4', 'q', 'set1', JobState.QUEUED));
        provider.addJob(makeJobInfo('j5', 'q', 'set1', JobState.SUCCEEDED));

        const counts = provider.getJobCounts();
        assert.strictEqual(counts['RUNNING'], 2);
        assert.strictEqual(counts['FAILED'], 1);
        assert.strictEqual(counts['QUEUED'], 1);
        assert.strictEqual(counts['SUCCEEDED'], 1);
    });

    it('does not include states with zero count', () => {
        const provider = new JobTreeProvider(undefined);
        provider.addJob(makeJobInfo('j1', 'q', 'set1', JobState.RUNNING));

        const counts = provider.getJobCounts();
        // Only RUNNING should be present; all other states must be absent
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'FAILED'));
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'QUEUED'));
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'PENDING'));
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'SUCCEEDED'));
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'CANCELLED'));
        assert.ok(!Object.prototype.hasOwnProperty.call(counts, 'PREEMPTED'));
        assert.strictEqual(counts['RUNNING'], 1);
    });

    it('counts jobs across multiple job sets', () => {
        const provider = new JobTreeProvider(undefined);

        provider.addJob(makeJobInfo('j1', 'q', 'set1', JobState.RUNNING));
        provider.addJob(makeJobInfo('j2', 'q', 'set2', JobState.RUNNING));
        provider.addJob(makeJobInfo('j3', 'q', 'set2', JobState.FAILED));

        const counts = provider.getJobCounts();
        assert.strictEqual(counts['RUNNING'], 2);
        assert.strictEqual(counts['FAILED'], 1);
    });
});

// ---------------------------------------------------------------------------
// Tests for buildJobCountLabel()
// ---------------------------------------------------------------------------
describe('buildJobCountLabel()', () => {
    it('returns $(dash) when all counts are zero', () => {
        assert.strictEqual(buildJobCountLabel({}), '$(dash)');
    });

    it('returns $(dash) when all provided counts are explicitly zero', () => {
        assert.strictEqual(buildJobCountLabel({ RUNNING: 0, FAILED: 0, QUEUED: 0 }), '$(dash)');
    });

    it('shows $(play) N when only RUNNING jobs are present', () => {
        const label = buildJobCountLabel({ RUNNING: 3 });
        assert.strictEqual(label, '$(play) 3');
    });

    it('shows both $(play) and $(error) segments for RUNNING + FAILED, no $(clock)', () => {
        const label = buildJobCountLabel({ RUNNING: 2, FAILED: 1 });
        assert.ok(label.includes('$(play) 2'), `expected $(play) 2 in "${label}"`);
        assert.ok(label.includes('$(error) 1'), `expected $(error) 1 in "${label}"`);
        assert.ok(!label.includes('$(clock)'), `unexpected $(clock) in "${label}"`);
    });

    it('combines QUEUED and PENDING into a single $(clock) segment', () => {
        const label = buildJobCountLabel({ QUEUED: 3, PENDING: 2 });
        assert.strictEqual(label, '$(clock) 5');
    });

    it('suppresses zero-count states — QUEUED=0 and PENDING=0 produce no $(clock)', () => {
        const label = buildJobCountLabel({ RUNNING: 1, QUEUED: 0, PENDING: 0, FAILED: 0 });
        assert.strictEqual(label, '$(play) 1');
        assert.ok(!label.includes('$(clock)'), `unexpected $(clock) in "${label}"`);
        assert.ok(!label.includes('$(error)'), `unexpected $(error) in "${label}"`);
    });

    it('shows all three segments when RUNNING, FAILED, and QUEUED/PENDING are all non-zero', () => {
        const label = buildJobCountLabel({ RUNNING: 5, FAILED: 2, QUEUED: 4, PENDING: 1 });
        assert.ok(label.includes('$(play) 5'), `expected $(play) 5 in "${label}"`);
        assert.ok(label.includes('$(error) 2'), `expected $(error) 2 in "${label}"`);
        assert.ok(label.includes('$(clock) 5'), `expected $(clock) 5 in "${label}"`);
    });

    it('shows $(error) N alone when only FAILED jobs are present', () => {
        const label = buildJobCountLabel({ FAILED: 4 });
        assert.strictEqual(label, '$(error) 4');
    });
});

after(() => {
    uninstallVscodeMock();
});
