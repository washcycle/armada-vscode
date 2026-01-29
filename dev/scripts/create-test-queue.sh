#!/bin/bash
# Create a test queue in Armada for integration testing

set -e

ARMADA_URL="${ARMADA_URL:-localhost:30002}"
QUEUE_NAME="${QUEUE_NAME:-test}"

echo "Creating test queue '${QUEUE_NAME}' on Armada at ${ARMADA_URL}..."

# Check if armadactl is available
if ! command -v armadactl &> /dev/null; then
    echo "Error: armadactl is not installed"
    exit 1
fi

# Create armadactl config if it doesn't exist
if [ ! -f ~/.armadactl.yaml ]; then
    echo "Creating ~/.armadactl.yaml config..."
    cat > ~/.armadactl.yaml <<EOF
currentContext: test
contexts:
  - name: test
    armadaUrl: ${ARMADA_URL}
    execTimeout: 2m
EOF
fi

# Create the queue
armadactl create queue "${QUEUE_NAME}" \
    --priority-factor 1.0 \
    --owners anonymous

echo "✓ Test queue created successfully"

# Verify queue was created
if armadactl get queue "${QUEUE_NAME}" > /dev/null 2>&1; then
    echo "✓ Queue verified"
else
    echo "⚠ Could not verify queue (this may be normal)"
fi
