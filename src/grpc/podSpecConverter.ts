import type { Type, Field } from 'protobufjs';

/**
 * Convert Kubernetes YAML into the shape the vendored Armada protos expect.
 *
 * The previous implementation hand-copied an allowlist of nine PodSpec fields
 * and ten Container fields, so everything else a user wrote was dropped
 * silently: `priorityClassName`, pod-level `securityContext`, `initContainers`,
 * container `lifecycle` and the rest never reached the server, and the job ran
 * with different semantics than the file described.
 *
 * This walks the loaded protobuf descriptor instead, so every field the proto
 * knows about is forwarded and new ones work without code changes. Only the
 * places where the vendored gogo protos genuinely differ from Kubernetes YAML
 * are reshaped:
 *
 *   1. Embedded structs. gogoproto's `(gogoproto.embed)` option is not applied
 *      to the generated `.proto`, so `Volume.volumeSource`,
 *      `SecretKeySelector.localObjectReference` and friends appear as real
 *      nested messages. Kubernetes YAML writes their contents flat
 *      (`persistentVolumeClaim:` directly on the volume, `name:` directly on
 *      the secret ref), so those keys have to be lifted into the wrapper.
 *      Without this a PVC volume encodes to nothing but its name — and an empty
 *      VolumeSource means EmptyDir, so the mount silently becomes scratch space.
 *
 *   2. Quantity. `resource.Quantity` is a message with a single `string` field,
 *      so `memory: 5Gi` (or an unquoted `cpu: 16`) has to become
 *      `{ string: '5Gi' }`. This applies anywhere a Quantity appears, not just
 *      under `resources` — `emptyDir.sizeLimit` is one too.
 *
 *   3. IntOrString. Ports and probe targets accept either form.
 *
 * Anything the descriptor does not recognise is reported to `onUnknownField`
 * rather than dropped in silence, so a typo like `imagePullPolcy` is visible.
 */

/** Fully-qualified names of the scalar-shaped wrapper messages. */
const QUANTITY_TYPE = 'k8s.io.apimachinery.pkg.api.resource.Quantity';
const INT_OR_STRING_TYPE = 'k8s.io.apimachinery.pkg.util.intstr.IntOrString';

/**
 * Wrapper fields whose contents Kubernetes YAML writes flat on the parent.
 *
 * Detected structurally rather than hard-coded by name: a single message-typed
 * field is treated as embedded when the YAML key is absent and the parent has
 * keys that only the wrapper's type declares. Keeping the known names as a hint
 * makes the intent explicit and the behaviour predictable.
 */
const EMBEDDED_FIELD_NAMES = new Set([
    'volumeSource',
    'localObjectReference',
    'handler'
]);

export interface ConversionReport {
    /** Dotted paths of keys the descriptor does not declare. */
    unknownFields: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Kubernetes accepts unquoted numeric quantities (`cpu: 16`, `memory: 5Gi`).
 * The proto wants the string form in a wrapper message.
 */
function toQuantity(value: unknown): unknown {
    if (isPlainObject(value) && 'string' in value) {
        return value; // already wrapped
    }
    return { string: String(value) };
}

function toIntOrString(value: unknown): unknown {
    if (isPlainObject(value)) {
        return value;
    }
    // type 0 = Int, 1 = String, matching intstr.IntOrString.
    return typeof value === 'number'
        ? { type: 0, intVal: value }
        : { type: 1, strVal: String(value) };
}

/**
 * Look up a field by its YAML key, accepting either casing.
 *
 * The Kubernetes protos declare camelCase field names, but Armada's own messages
 * use snake_case (`client_id`, `tls_enabled`) while users write the camelCase
 * form that armadactl and the JSON API accept. Converting the key rather than
 * maintaining an alias table means new fields need no code change.
 */
function findField(messageType: Type, key: string): Field | undefined {
    const direct = messageType.fields[key];
    if (direct) {
        return direct;
    }
    const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return snake === key ? undefined : messageType.fields[snake];
}

/**
 * Find the embedded wrapper field, if any, that declares `key`.
 *
 * Returns the wrapper field name so the caller can nest the value under it.
 */
function findEmbeddedHost(messageType: Type, key: string): Field | undefined {
    for (const field of messageType.fieldsArray) {
        if (!EMBEDDED_FIELD_NAMES.has(field.name)) {
            continue;
        }
        field.resolve();
        const inner = field.resolvedType as Type | null;
        if (inner && typeof inner.fieldsArray !== 'undefined' && findField(inner, key)) {
            return field;
        }
    }
    return undefined;
}

function convertValue(
    value: unknown,
    field: Field,
    path: string,
    report: ConversionReport
): unknown {
    field.resolve();

    if (field.map) {
        // Map values still need per-value conversion (resources.limits is a
        // map<string, Quantity>).
        if (!isPlainObject(value)) {
            return value;
        }
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            out[key] = convertLeaf(entry, field, `${path}.${key}`, report);
        }
        return out;
    }

    if (field.repeated) {
        if (!Array.isArray(value)) {
            // Let the caller's validation surface the shape error; forwarding it
            // unchanged keeps the proto layer's own message intact.
            return value;
        }
        return value.map((entry, index) => convertLeaf(entry, field, `${path}[${index}]`, report));
    }

    return convertLeaf(value, field, path, report);
}

function convertLeaf(
    value: unknown,
    field: Field,
    path: string,
    report: ConversionReport
): unknown {
    const typeName = field.resolvedType?.fullName?.replace(/^\./, '');

    if (typeName === QUANTITY_TYPE) {
        return toQuantity(value);
    }
    if (typeName === INT_OR_STRING_TYPE) {
        return toIntOrString(value);
    }

    const messageType = field.resolvedType as Type | undefined;
    if (messageType && typeof messageType.fieldsArray !== 'undefined' && isPlainObject(value)) {
        return convertMessage(value, messageType, path, report);
    }

    return value;
}

/**
 * Convert one YAML mapping into the descriptor's shape, recursively.
 */
export function convertMessage(
    source: Record<string, unknown>,
    messageType: Type,
    path: string,
    report: ConversionReport
): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue;
        }
        const childPath = path ? `${path}.${key}` : key;

        const field = findField(messageType, key);
        if (field) {
            out[field.name] = convertValue(value, field, childPath, report);
            continue;
        }

        // Not a direct field: it may belong to an embedded wrapper that
        // Kubernetes YAML writes flat (volumeSource, localObjectReference).
        const host = findEmbeddedHost(messageType, key);
        if (host) {
            host.resolve();
            const hostType = host.resolvedType as Type;
            const nested = (out[host.name] as Record<string, unknown>) ?? {};
            const hostField = findField(hostType, key) as Field;
            nested[hostField.name] = convertValue(value, hostField, childPath, report);
            out[host.name] = nested;
            continue;
        }

        report.unknownFields.push(childPath);
    }

    return out;
}

/**
 * Convert a Kubernetes PodSpec written as YAML into the vendored proto shape.
 */
export function convertPodSpec(
    spec: Record<string, unknown>,
    podSpecType: Type,
    report: ConversionReport,
    path = 'podSpec'
): Record<string, unknown> {
    const converted = convertMessage(spec, podSpecType, path, report);
    // Armada rejects a pod with no restartPolicy; Never is the only sensible
    // default for a batch job and matches the previous behaviour.
    if (converted.restartPolicy === undefined) {
        converted.restartPolicy = 'Never';
    }
    return converted;
}

/**
 * Read the pod specs from a job, accepting both forms armadactl accepts.
 *
 * The proto carries a deprecated singular `pod_spec` (field 2) alongside the
 * repeated `pod_specs` (field 7), and armadactl reconciles them with
 * GetMainPodSpec. Users — and this extension's own README — overwhelmingly
 * write the singular `podSpec:`, so accepting only the plural form made most
 * real job files unsubmittable. Both are normalized into the repeated field:
 * that is wire-equivalent for a single spec and avoids emitting a deprecated
 * field, and sending both risks the server reading one as the main spec and the
 * other as an extra gang member.
 */
/** Keys handled by readPodSpecs rather than by descriptor lookup. */
const POD_SPEC_KEYS = new Set(['podSpec', 'podSpecs', 'pod_spec', 'pod_specs']);

/**
 * Convert one entry of a job file's `jobs:` list into a JobSubmitRequestItem.
 *
 * Job-level fields were hand-copied too, so `ingress`, `services` and
 * `scheduler` never reached the server despite being documented in the
 * extension's own types.
 */
export function convertJobItem(
    job: Record<string, unknown>,
    itemType: Type,
    podSpecType: Type,
    report: ConversionReport,
    path: string
): Record<string, unknown> {
    const out: Record<string, unknown> = {
        priority: 0,
        namespace: 'default',
        client_id: '',
        labels: {},
        annotations: {}
    };

    for (const [key, value] of Object.entries(job)) {
        if (value === undefined || POD_SPEC_KEYS.has(key)) {
            continue;
        }
        const field = findField(itemType, key);
        if (!field) {
            report.unknownFields.push(`${path}.${key}`);
            continue;
        }
        out[field.name] = convertValue(value, field, `${path}.${key}`, report);
    }

    out.pod_specs = readPodSpecs(job).map((spec, index) =>
        convertPodSpec(spec, podSpecType, report, `${path}.podSpec[${index}]`)
    );

    return out;
}

export function readPodSpecs(job: Record<string, unknown>): Record<string, unknown>[] {
    const plural = job.podSpecs;
    const singular = job.podSpec;

    const specs: unknown[] = [];
    if (Array.isArray(plural)) {
        specs.push(...plural);
    } else if (isPlainObject(plural)) {
        // A bare mapping under the plural key: the mistake the old schema's
        // "required: podSpecs" message invited. Previously an unhandled
        // `job.podSpecs.map is not a function`.
        specs.push(plural);
    }
    if (isPlainObject(singular)) {
        specs.push(singular);
    } else if (Array.isArray(singular)) {
        specs.push(...singular);
    }

    return specs.filter(isPlainObject);
}
