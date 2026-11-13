import * as assert from 'assert';
import { MockArmadaServer, REJECT_NAMESPACE } from '../../mock/armadaServer';
import { ArmadaClient } from '../../../grpc/armadaClient';
import { ArmadaJobSpec } from '../../../types/armada';

/**
 * These assert on what actually crossed the wire, decoded by the server, rather
 * than on the client's intermediate objects. A field that the client builds but
 * the proto silently discards — the failure mode behind the dropped PVC claim —
 * is only visible from this side.
 */
describe('job submission conversion', function () {
    let server: MockArmadaServer;
    let client: ArmadaClient;
    let logs: string[];

    before(async function () {
        server = new MockArmadaServer();
        const port = await server.start();
        client = new ArmadaClient({ armadaUrl: `localhost:${port}`, auth: { type: 'none' } });
        logs = [];
        client.onLogMessage = (message) => logs.push(message);
    });

    after(async function () {
        await server.stop();
    });

    beforeEach(function () {
        server.resetSubmitCalls();
        logs.length = 0;
    });

    const container = { name: 'c', image: 'busybox', resources: {} };

    function spec(jobs: any[]): ArmadaJobSpec {
        return { queue: 'q', jobSetId: 'js', jobs } as ArmadaJobSpec;
    }

    describe('podSpec / podSpecs forms', () => {
        it('accepts the singular podSpec form armadactl uses', async () => {
            // The form in the extension's own README and in most real job files.
            // Reading only the plural key sent an empty pod_specs, which the
            // server rejects outright.
            const response = await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } }
            ]));

            assert.strictEqual(response.rejected.length, 0, JSON.stringify(response.rejected));
            assert.strictEqual(response.jobIds.length, 1);
            const item = server.getLastSubmitRequest().job_request_items[0];
            assert.strictEqual(item.pod_specs.length, 1);
            assert.strictEqual(item.pod_specs[0].containers[0].image, 'busybox');
        });

        it('accepts the plural podSpecs list form', async () => {
            const response = await client.submitJobs(spec([
                { namespace: 'apqx', podSpecs: [{ containers: [container] }] }
            ]));

            assert.strictEqual(response.rejected.length, 0);
            assert.strictEqual(server.getSubmittedPodSpec().containers.length, 1);
        });

        it('accepts a bare mapping under the plural key without crashing', async () => {
            // Renaming podSpec -> podSpecs without also making it a list is the
            // exact mistake the old schema error invited; it used to throw
            // "job.podSpecs.map is not a function".
            const response = await client.submitJobs(spec([
                { namespace: 'apqx', podSpecs: { containers: [container] } }
            ]));

            assert.strictEqual(response.rejected.length, 0);
            assert.strictEqual(server.getSubmittedPodSpec().containers.length, 1);
        });

        it('never sends both pod_spec and pod_specs', async () => {
            // Populating both risks the server treating one as the main spec and
            // the other as an extra gang member.
            await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } }
            ]));

            const item = server.getLastSubmitRequest().job_request_items[0];
            assert.strictEqual(item.pod_specs.length, 1);
            assert.ok(
                item.pod_spec === null || item.pod_spec === undefined,
                `deprecated singular field should stay unset, got ${JSON.stringify(item.pod_spec)}`
            );
        });

        it('sends every spec when both forms appear', async () => {
            await client.submitJobs(spec([
                {
                    namespace: 'apqx',
                    podSpec: { containers: [container] },
                    podSpecs: [{ containers: [container] }]
                }
            ]));

            assert.strictEqual(server.getLastSubmitRequest().job_request_items[0].pod_specs.length, 2);
        });
    });

    describe('pod-level fields', () => {
        it('preserves the scheduling and security fields the allowlist used to drop', async () => {
            // Each of these was silently discarded: the job submitted fine and
            // then ran with different semantics than the file described.
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    priorityClassName: 'armada-default',
                    securityContext: { fsGroup: 7005, supplementalGroups: [9000] },
                    serviceAccountName: 'runner',
                    schedulerName: 'default-scheduler',
                    activeDeadlineSeconds: 259200,
                    terminationGracePeriodSeconds: 0,
                    nodeSelector: { platform: 'diva' },
                    tolerations: [{ key: 'platform', operator: 'Equal', value: 'diva', effect: 'NoSchedule' }],
                    imagePullSecrets: [{ name: 'apqxdls-acr-credentials' }],
                    containers: [container]
                }
            }]));

            const sent = server.getSubmittedPodSpec();
            assert.strictEqual(sent.priorityClassName, 'armada-default');
            assert.strictEqual(String(sent.securityContext.fsGroup), '7005');
            assert.deepStrictEqual(sent.securityContext.supplementalGroups.map(String), ['9000']);
            assert.strictEqual(sent.serviceAccountName, 'runner');
            assert.strictEqual(sent.schedulerName, 'default-scheduler');
            assert.strictEqual(String(sent.activeDeadlineSeconds), '259200');
            assert.deepStrictEqual(sent.nodeSelector, { platform: 'diva' });
            assert.strictEqual(sent.tolerations[0].value, 'diva');
            assert.strictEqual(sent.imagePullSecrets[0].name, 'apqxdls-acr-credentials');
        });

        it('preserves initContainers, including a native sidecar', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    initContainers: [{
                        name: 'ocats-solver',
                        image: 'solver:latest',
                        restartPolicy: 'Always',
                        resources: {}
                    }],
                    containers: [container]
                }
            }]));

            const sent = server.getSubmittedPodSpec();
            assert.strictEqual(sent.initContainers.length, 1);
            assert.strictEqual(sent.initContainers[0].name, 'ocats-solver');
            assert.strictEqual(sent.initContainers[0].restartPolicy, 'Always');
        });

        it('defaults restartPolicy to Never for batch jobs', async () => {
            await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } }
            ]));
            assert.strictEqual(server.getSubmittedPodSpec().restartPolicy, 'Never');
        });

        it('honours an explicit restartPolicy', async () => {
            await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { restartPolicy: 'OnFailure', containers: [container] } }
            ]));
            assert.strictEqual(server.getSubmittedPodSpec().restartPolicy, 'OnFailure');
        });
    });

    describe('gogo-proto embedded structs', () => {
        it('keeps a PVC claimName, which flat YAML used to lose entirely', async () => {
            // Volume nests its source under `volumeSource`, so a flat
            // persistentVolumeClaim encoded to nothing but the name — and an
            // empty VolumeSource means EmptyDir, silently turning a shared
            // NetApp/VAST mount into empty scratch space.
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    volumes: [
                        { name: 'dls-data', persistentVolumeClaim: { claimName: 'dls-data' } },
                        { name: 'shm', emptyDir: { medium: 'Memory', sizeLimit: '64Gi' } }
                    ],
                    containers: [container]
                }
            }]));

            const sent = server.getSubmittedPodSpec();
            assert.strictEqual(
                sent.volumes[0].volumeSource.persistentVolumeClaim.claimName,
                'dls-data',
                'PVC claim name must survive the wire'
            );
            assert.strictEqual(sent.volumes[1].volumeSource.emptyDir.medium, 'Memory');
            // sizeLimit is a Quantity, which is a message wrapping a string.
            assert.strictEqual(sent.volumes[1].volumeSource.emptyDir.sizeLimit.string, '64Gi');
        });

        it('keeps the secret name on a secretKeyRef env var', async () => {
            // SecretKeySelector nests the name under `localObjectReference`, so
            // the credential name vanished and pods started with unset AWS_* vars.
            await client.submitJobs(spec([{
                namespace: 'wf1',
                podSpec: {
                    containers: [{
                        ...container,
                        env: [
                            {
                                name: 'AWS_ACCESS_KEY_ID',
                                valueFrom: { secretKeyRef: { name: 'wf1-vast-s3-credentials', key: 'accessKeyID' } }
                            },
                            {
                                name: 'CFG',
                                valueFrom: { configMapKeyRef: { name: 'app-config', key: 'mode' } }
                            },
                            { name: 'PLAIN', value: 'literal' }
                        ]
                    }]
                }
            }]));

            const env = server.getSubmittedPodSpec().containers[0].env;
            assert.strictEqual(
                env[0].valueFrom.secretKeyRef.localObjectReference.name,
                'wf1-vast-s3-credentials'
            );
            assert.strictEqual(env[0].valueFrom.secretKeyRef.key, 'accessKeyID');
            assert.strictEqual(env[1].valueFrom.configMapKeyRef.localObjectReference.name, 'app-config');
            assert.strictEqual(env[2].value, 'literal');
        });

        it('keeps envFrom secretRef and configMapRef names', async () => {
            await client.submitJobs(spec([{
                namespace: 'wf1',
                podSpec: {
                    containers: [{
                        ...container,
                        envFrom: [
                            { secretRef: { name: 'creds' } },
                            { configMapRef: { name: 'cfg' }, prefix: 'APP_' }
                        ]
                    }]
                }
            }]));

            const envFrom = server.getSubmittedPodSpec().containers[0].envFrom;
            assert.strictEqual(envFrom[0].secretRef.localObjectReference.name, 'creds');
            assert.strictEqual(envFrom[1].configMapRef.localObjectReference.name, 'cfg');
            assert.strictEqual(envFrom[1].prefix, 'APP_');
        });

        it('keeps a probe handler, which the proto nests separately', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    containers: [{
                        ...container,
                        livenessProbe: { exec: { command: ['true'] }, periodSeconds: 10 }
                    }]
                }
            }]));

            const probe = server.getSubmittedPodSpec().containers[0].livenessProbe;
            assert.deepStrictEqual(probe.handler.exec.command, ['true']);
            assert.strictEqual(probe.periodSeconds, 10);
        });
    });

    describe('container fields', () => {
        it('preserves the fields the container allowlist used to drop', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    containers: [{
                        name: 'main',
                        image: 'busybox',
                        command: ['sh', '-c'],
                        args: ['echo hi'],
                        workingDir: '/work',
                        imagePullPolicy: 'Always',
                        terminationMessagePolicy: 'FallbackToLogsOnError',
                        lifecycle: { preStop: { exec: { command: ['kill', '-KILL', '1'] } } },
                        volumeMounts: [{ name: 'dls-data', mountPath: '/data' }],
                        securityContext: { runAsUser: 7005 },
                        resources: {}
                    }]
                }
            }]));

            const sent = server.getSubmittedPodSpec().containers[0];
            assert.strictEqual(sent.workingDir, '/work');
            assert.strictEqual(sent.terminationMessagePolicy, 'FallbackToLogsOnError');
            assert.deepStrictEqual(sent.lifecycle.preStop.exec.command, ['kill', '-KILL', '1']);
            assert.strictEqual(sent.volumeMounts[0].mountPath, '/data');
            assert.strictEqual(String(sent.securityContext.runAsUser), '7005');
            assert.deepStrictEqual(sent.command, ['sh', '-c']);
        });

        it('wraps resource quantities in every form users write', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    containers: [{
                        ...container,
                        resources: {
                            limits: { cpu: 16, memory: '125Gi', 'nvidia.com/gpu': 1 },
                            requests: { cpu: '7900m', memory: '512Mi', 'ephemeral-storage': '20Gi' }
                        }
                    }]
                }
            }]));

            const res = server.getSubmittedPodSpec().containers[0].resources;
            // Unquoted numbers are valid Kubernetes and must not be lost.
            assert.strictEqual(res.limits.cpu.string, '16');
            assert.strictEqual(res.limits.memory.string, '125Gi');
            assert.strictEqual(res.limits['nvidia.com/gpu'].string, '1');
            assert.strictEqual(res.requests.cpu.string, '7900m');
            assert.strictEqual(res.requests['ephemeral-storage'].string, '20Gi');
        });

        it('preserves container ports', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: {
                    containers: [{ ...container, ports: [{ containerPort: 29500, name: 'dist' }] }]
                }
            }]));

            const ports = server.getSubmittedPodSpec().containers[0].ports;
            assert.strictEqual(ports[0].containerPort, 29500);
            assert.strictEqual(ports[0].name, 'dist');
        });
    });

    describe('job-level fields', () => {
        it('forwards the job fields that were hand-copied before', async () => {
            // ingress, services and scheduler are declared in the extension's own
            // job type but never reached the server.
            await client.submitJobs(spec([{
                namespace: 'apqx',
                priority: 1000,
                clientId: 'dedup-key-1',
                scheduler: 'pulsar',
                labels: { team: 'apqx' },
                annotations: { 'armada/owner': 'matt' },
                ingress: [{ ports: [8080], tlsEnabled: true }],
                services: [{ name: 'headless', ports: [29500] }],
                podSpec: { containers: [container] }
            }]));

            const item = server.getLastSubmitRequest().job_request_items[0];
            assert.strictEqual(item.priority, 1000);
            assert.strictEqual(item.namespace, 'apqx');
            assert.strictEqual(item.client_id, 'dedup-key-1');
            assert.strictEqual(item.scheduler, 'pulsar');
            assert.deepStrictEqual(item.labels, { team: 'apqx' });
            assert.deepStrictEqual(item.annotations, { 'armada/owner': 'matt' });
            assert.strictEqual(item.ingress.length, 1);
            assert.deepStrictEqual(item.ingress[0].ports, [8080]);
            assert.strictEqual(item.ingress[0].tls_enabled, true);
            assert.strictEqual(item.services[0].name, 'headless');
            assert.deepStrictEqual(item.services[0].ports, [29500]);
        });

        it('defaults namespace and priority when omitted', async () => {
            await client.submitJobs(spec([{ podSpec: { containers: [container] } }]));

            const item = server.getLastSubmitRequest().job_request_items[0];
            assert.strictEqual(item.namespace, 'default');
            assert.strictEqual(item.priority, 0);
        });

        it('warns about an unknown job-level key', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                jobSetId: 'not-a-per-job-field',
                podSpec: { containers: [container] }
            }]));

            assert.match(logs.join('\n'), /jobSetId/);
        });
    });

    describe('unrecognized fields', () => {
        it('warns instead of dropping an unknown key in silence', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: { backoffLimit: 3, containers: [container] }
            }]));

            const joined = logs.join('\n');
            assert.match(joined, /backoffLimit/, `expected a warning naming the key, got: ${joined}`);
        });

        it('warns about a misspelled container field', async () => {
            await client.submitJobs(spec([{
                namespace: 'apqx',
                podSpec: { containers: [{ ...container, imagePullPolcy: 'Always' }] }
            }]));

            assert.match(logs.join('\n'), /imagePullPolcy/);
        });

        it('stays quiet for a fully valid spec', async () => {
            await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } }
            ]));

            assert.ok(
                !logs.some(m => /unrecognized/i.test(m)),
                `no warning expected, got: ${logs.join('\n')}`
            );
        });
    });

    describe('per-item rejections', () => {
        it('reports a rejected job instead of counting it as submitted', async () => {
            // The server can accept some items and reject others inside one
            // successful call; those rejections used to be reported as successes.
            const response = await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } },
                { namespace: REJECT_NAMESPACE, podSpec: { containers: [container] } }
            ]));

            assert.strictEqual(response.jobIds.length, 1);
            assert.strictEqual(response.rejected.length, 1);
            assert.strictEqual(response.rejected[0].index, 1);
            assert.match(response.rejected[0].error, /not permitted/);
        });

        it('returns no job ids when every item is rejected', async () => {
            const response = await client.submitJobs(spec([
                { namespace: REJECT_NAMESPACE, podSpec: { containers: [container] } }
            ]));

            assert.strictEqual(response.jobIds.length, 0);
            assert.strictEqual(response.rejected.length, 1);
        });

        it('never yields an id that stringifies to [object Object]', async () => {
            const response = await client.submitJobs(spec([
                { namespace: 'apqx', podSpec: { containers: [container] } }
            ]));

            for (const id of response.jobIds) {
                assert.strictEqual(typeof id, 'string');
                assert.notStrictEqual(id, '[object Object]');
                assert.ok(id.length > 0);
            }
        });
    });
});
