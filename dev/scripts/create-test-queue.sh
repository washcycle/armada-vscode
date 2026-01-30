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
  test:
    armadaUrl: ${ARMADA_URL}
    execTimeout: 2m
EOF
fi

# Create the queue with retry logic
MAX_RETRIES=10
RETRY_DELAY=5
CREATED=false

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i/$MAX_RETRIES to create queue..."
    if armadactl create queue "${QUEUE_NAME}" \
        --priority-factor 1.0 \
        --owners anonymous 2>&1; then
        echo "✓ Test queue created successfully"
        CREATED=true
        break
    else
        if [ $i -eq $MAX_RETRIES ]; then
            echo "✗ Failed to create queue after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "Connection failed, waiting ${RETRY_DELAY}s before retry..."
        sleep $RETRY_DELAY
    fi
done

# Verify queue was created
if [ "$CREATED" = true ]; then
    if armadactl get queue "${QUEUE_NAME}" > /dev/null 2>&1; then
        echo "✓ Queue verified"
    else
        echo "⚠ Could not verify queue (this may be normal)"
    fi
fi
