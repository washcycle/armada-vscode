# Armada Operator Local Environment

The `dev/Makefile` provisions the full Armada demo stack (kind + Helm dependencies + Armada Operator + CRs) without cloning the upstream operator repository. We vendor the necessary manifests/values under `dev/operator/quickstart/` and invoke published Helm charts directly.

## Prerequisites

- Docker daemon (for `kind` nodes)
- [`kind`](https://kind.sigs.k8s.io/) v0.17+
- `kubectl` 1.26+ and `helm` 3.11+
- ~8 GiB of free RAM/local disk for Pulsar, Redis, Postgres, Prometheus

## Core Targets

| Target | Description |
| --- | --- |
| `make up` | Creates `kind-armada`, installs cert-manager + dependencies via Helm, installs the Armada Operator chart, and applies everything under `dev/operator/quickstart/crs/` plus the demo PriorityClass. |
| `make status` | Shows pod status in `armada-system`, `armada`, and `data` namespaces. |
| `make logs` | Streams the operator deployment logs (Ctrl+C to stop). |
| `make down` | Deletes the CRs/PriorityClass, uninstalls Helm releases, removes cert-manager, and deletes the kind cluster. |

We also expose the building blocks as individual targets (e.g., `install-armada-deps`, `install-armada-operator`, `apply-armada-crs`) so you can iterate on one portion of the stack without reprovisioning everything.

## Customisation Knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `KIND_CLUSTER_NAME` | `armada` | Name for the kind cluster/context (`kind-armada`). |
| `ARMADA_NAMESPACE` | `armada` | Namespace that hosts the Armada services deployed by the CRs. |
| `DATA_NAMESPACE` | `data` | Namespace for Pulsar/Redis/Postgres Helm charts. |
| `CERT_MANAGER_MANIFEST` | v1.14.5 URL | Manifest applied for cert-manager. |
| `HELM_TIMEOUT` | `15m` | Timeout passed to Helm installations. |

Override any of these when invoking `make`, e.g. `KIND_CLUSTER_NAME=dev make up`.

## Workflow

```bash
# Provision everything (kind cluster, Helm deps, operator, CRs)
make up

# Inspect status / logs while services start
make status
make logs

# When finished, clean up the entire environment
make down
```

The resulting demo cluster exposes the following NodePorts:

- Lookout UI → `http://localhost:30000`
- REST API → `http://localhost:30001`
- gRPC API → `localhost:30002`
- Binoculars HTTP → `http://localhost:30003`
- Binoculars gRPC → `localhost:30004`

The kind cluster is configured with port mappings (see `dev/operator/kind-config.yaml`) that forward these NodePorts to your localhost, allowing you to connect to Armada services from your host machine or the VSCode extension.

### Connecting with the VSCode Extension

After running `make up`, configure your VSCode extension:

```bash
# Copy the sample armadactl config to your home directory
cp dev/operator/quickstart/armadactl.yaml ~/.armadactl.yaml
```

Or manually configure in VSCode using the "Armada: Setup Configuration" command:

- Server URL: `localhost:30002`
- Context name: `kind-armada`

### Editing the Demo Manifests

- Armada CRs live under `dev/operator/quickstart/crs/` (one file per component)
- PriorityClass lives in `dev/operator/quickstart/priority-class.yaml`
- Helm values for Pulsar/Redis/Postgres/Prometheus live in the same directory

Feel free to edit these files before running `make up` (or re-run `make apply-armada-crs`) to enable/disable components, change image tags, or point at different services.

## Troubleshooting

1. **`kind` binary missing** – install `kind` and ensure it’s on `PATH`.
2. **Pods stuck Pending** – `kubectl --context kind-$(KIND_CLUSTER_NAME) describe pod <name>` to check events/taints.
3. **Helm install timeouts** – increase `HELM_TIMEOUT=25m make up` or re-run the specific `install-*` target.
4. **Need to reuse an existing cluster** – skip `kind-create` by creating your own cluster with the same name ahead of time.
5. **Custom NodePorts/ingress** – edit the CRs or ingress Helm values under `dev/operator/quickstart/` before applying.

Refer to the upstream [Armada Operator quickstart runbooks](https://github.com/armadaproject/armada-operator/tree/main/dev/runbooks) for deep dives into each component.
