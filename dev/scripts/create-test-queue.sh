#!/bin/bash
# Create a test queue in Armada for integration testing

set -e

KUBE_CONTEXT="${KUBE_CONTEXT:-kind-armada}"
QUEUE_YAML="${QUEUE_YAML:-operator/quickstart/test-queue.yaml}"

echo "Creating test queue using ${QUEUE_YAML}..."

# Apply the queue manifest
kubectl --context "${KUBE_CONTEXT}" apply -f "${QUEUE_YAML}"

echo "✓ Test queue created successfully"

# Wait for queue to be ready
echo "Waiting for queue to be ready..."
sleep 2

# Verify queue was created
kubectl --context "${KUBE_CONTEXT}" get queue -n armada test 2>/dev/null && echo "✓ Queue verified" || echo "⚠ Could not verify queue (may not be created yet)"
