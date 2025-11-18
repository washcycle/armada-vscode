.PHONY: up down status logs kind-create kind-delete helm-repos install-cert-manager uninstall-cert-manager install-armada-deps uninstall-armada-deps install-armada-operator uninstall-armada-operator apply-armada-crs delete-armada-crs apply-priority-class delete-priority-class ensure-namespaces

KIND_CLUSTER_NAME ?= armada
KIND_CONTEXT := kind-$(KIND_CLUSTER_NAME)
ARMADA_NAMESPACE ?= armada
ARMADA_SYSTEM_NAMESPACE ?= armada-system
DATA_NAMESPACE ?= data
MONITORING_NAMESPACE ?= monitoring
INGRESS_NAMESPACE ?= ingress-nginx
CERT_MANAGER_NAMESPACE ?= cert-manager
CERT_MANAGER_MANIFEST ?= https://github.com/cert-manager/cert-manager/releases/download/v1.14.5/cert-manager.yaml
HELM_TIMEOUT ?= 15m

MANIFEST_DIR := operator/quickstart
ARMADA_CRS_DIR := $(MANIFEST_DIR)/crs
PRIORITY_CLASS := $(MANIFEST_DIR)/priority-class.yaml
OPERATOR_RBAC_PATCH := $(MANIFEST_DIR)/operator-rbac-patch.yaml
PULSAR_VALUES := $(MANIFEST_DIR)/pulsar.values.yaml
REDIS_VALUES := $(MANIFEST_DIR)/redis.values.yaml
POSTGRES_VALUES := $(MANIFEST_DIR)/postgres.values.yaml

up: kind-create helm-repos install-cert-manager install-armada-deps install-armada-operator patch-operator-rbac apply-priority-class apply-armada-crs ## Stand up a kind cluster with Armada via Helm + Operator

down: delete-armada-crs delete-priority-class uninstall-armada-operator uninstall-armada-deps uninstall-cert-manager kind-delete ## Tear everything back down

status: ## Show workload status across namespaces
	@kubectl --context $(KIND_CONTEXT) get pods -n $(ARMADA_SYSTEM_NAMESPACE) || true
	@kubectl --context $(KIND_CONTEXT) get pods -n $(ARMADA_NAMESPACE) || true
	@kubectl --context $(KIND_CONTEXT) get pods -n $(DATA_NAMESPACE) || true

logs: ## Tail Armada Operator logs
	@echo "Streaming Armada Operator logs..."
	kubectl --context $(KIND_CONTEXT) logs -n $(ARMADA_SYSTEM_NAMESPACE) deployment/armada-operator-controller-manager -f

kind-create: ## Create a kind cluster if one does not already exist
	@if ! kind get clusters | grep -q '^$(KIND_CLUSTER_NAME)$$'; then \
		echo "Creating kind cluster $(KIND_CLUSTER_NAME) with port mappings..."; \
		kind create cluster --name $(KIND_CLUSTER_NAME) --config operator/kind-config.yaml; \
	else \
		echo "kind cluster $(KIND_CLUSTER_NAME) already exists"; \
	fi

kind-delete: ## Delete the kind cluster (best-effort)
	@if kind get clusters | grep -q '^$(KIND_CLUSTER_NAME)$$'; then \
		echo "Deleting kind cluster $(KIND_CLUSTER_NAME)..."; \
		kind delete cluster --name $(KIND_CLUSTER_NAME); \
	else \
		echo "kind cluster $(KIND_CLUSTER_NAME) not found"; \
	fi

helm-repos: ## Add/update Helm repos required for the demo stack
	helm repo add gresearch https://g-research.github.io/charts >/dev/null
	helm repo add apache https://pulsar.apache.org/charts >/dev/null
	helm repo add dandydev https://dandydeveloper.github.io/charts >/dev/null
	helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null		
	helm repo update >/dev/null

install-cert-manager: ## Install cert-manager into the kind cluster
	kubectl --context $(KIND_CONTEXT) apply -f $(CERT_MANAGER_MANIFEST)
	kubectl --context $(KIND_CONTEXT) wait --for=condition=Available --timeout=300s -n $(CERT_MANAGER_NAMESPACE) deploy/cert-manager deploy/cert-manager-cainjector deploy/cert-manager-webhook || true

uninstall-cert-manager: ## Remove cert-manager resources
	kubectl --context $(KIND_CONTEXT) delete -f $(CERT_MANAGER_MANIFEST) --ignore-not-found

ensure-namespaces: ## Ensure the shared namespaces exist
	@kubectl --context $(KIND_CONTEXT) get namespace $(DATA_NAMESPACE) >/dev/null 2>&1 || kubectl --context $(KIND_CONTEXT) create namespace $(DATA_NAMESPACE)
	@kubectl --context $(KIND_CONTEXT) get namespace $(ARMADA_NAMESPACE) >/dev/null 2>&1 || kubectl --context $(KIND_CONTEXT) create namespace $(ARMADA_NAMESPACE)
	@kubectl --context $(KIND_CONTEXT) get namespace $(MONITORING_NAMESPACE) >/dev/null 2>&1 || kubectl --context $(KIND_CONTEXT) create namespace $(MONITORING_NAMESPACE)
	@kubectl --context $(KIND_CONTEXT) get namespace $(INGRESS_NAMESPACE) >/dev/null 2>&1 || kubectl --context $(KIND_CONTEXT) create namespace $(INGRESS_NAMESPACE)

install-armada-deps: ensure-namespaces install-pulsar install-redis install-postgres ## Install all external dependencies via Helm

uninstall-armada-deps: uninstall-postgres uninstall-redis uninstall-pulsar ## Remove external dependencies

install-pulsar:
	helm upgrade --install pulsar apache/pulsar -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) --create-namespace -f $(PULSAR_VALUES) --wait --timeout $(HELM_TIMEOUT)

uninstall-pulsar:
	helm uninstall pulsar -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) || true

install-redis:
	helm upgrade --install redis dandydev/redis-ha -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) -f $(REDIS_VALUES) --wait --timeout $(HELM_TIMEOUT)

uninstall-redis:
	helm uninstall redis -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) || true

install-postgres:
	helm upgrade --install postgres bitnami/postgresql -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) -f $(POSTGRES_VALUES) --wait --timeout $(HELM_TIMEOUT)

uninstall-postgres:
	helm uninstall postgres -n $(DATA_NAMESPACE) --kube-context $(KIND_CONTEXT) || true

install-armada-operator: ## Install the released Armada Operator chart
	helm upgrade --install armada-operator gresearch/armada-operator -n $(ARMADA_SYSTEM_NAMESPACE) --kube-context $(KIND_CONTEXT) --create-namespace --wait --timeout $(HELM_TIMEOUT)

patch-operator-rbac: ## Patch the operator ClusterRole to allow binoculars deployment
	kubectl --context $(KIND_CONTEXT) apply -f $(OPERATOR_RBAC_PATCH)

uninstall-armada-operator: ## Remove the Armada Operator chart
	helm uninstall armada-operator -n $(ARMADA_SYSTEM_NAMESPACE) --kube-context $(KIND_CONTEXT) || true

apply-priority-class: ## Apply the demo PriorityClass required by Armada
	kubectl --context $(KIND_CONTEXT) apply -f $(PRIORITY_CLASS)

delete-priority-class: ## Remove the demo PriorityClass
	kubectl --context $(KIND_CONTEXT) delete -f $(PRIORITY_CLASS) --ignore-not-found

apply-armada-crs: ## Apply the Armada CRs that stand up the demo install
	kubectl --context $(KIND_CONTEXT) apply -n $(ARMADA_NAMESPACE) -f $(ARMADA_CRS_DIR)

delete-armada-crs: ## Delete the demo Armada CRs
	kubectl --context $(KIND_CONTEXT) delete -n $(ARMADA_NAMESPACE) -f $(ARMADA_CRS_DIR) --ignore-not-found
