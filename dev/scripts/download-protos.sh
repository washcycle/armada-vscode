#!/bin/bash
# Download all required proto files for Armada VSCode extension

set -e

PROTO_DIR="src/proto"
mkdir -p "$PROTO_DIR"

echo "Downloading Armada proto files..."
curl -sL https://raw.githubusercontent.com/armadaproject/armada/master/pkg/api/submit.proto -o "$PROTO_DIR/submit.proto"
curl -sL https://raw.githubusercontent.com/armadaproject/armada/master/pkg/api/event.proto -o "$PROTO_DIR/event.proto"
curl -sL https://raw.githubusercontent.com/armadaproject/armada/master/pkg/api/health.proto -o "$PROTO_DIR/pkg/api/health.proto"

echo "Downloading Kubernetes proto files..."
mkdir -p "$PROTO_DIR/k8s.io/api/core/v1"
mkdir -p "$PROTO_DIR/k8s.io/api/networking/v1"
mkdir -p "$PROTO_DIR/k8s.io/apimachinery/pkg/api/resource"
mkdir -p "$PROTO_DIR/k8s.io/apimachinery/pkg/apis/meta/v1"
mkdir -p "$PROTO_DIR/k8s.io/apimachinery/pkg/runtime"
mkdir -p "$PROTO_DIR/k8s.io/apimachinery/pkg/runtime/schema"
mkdir -p "$PROTO_DIR/k8s.io/apimachinery/pkg/util/intstr"

curl -sL https://raw.githubusercontent.com/kubernetes/api/master/core/v1/generated.proto -o "$PROTO_DIR/k8s.io/api/core/v1/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/api/master/networking/v1/generated.proto -o "$PROTO_DIR/k8s.io/api/networking/v1/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/apimachinery/master/pkg/api/resource/generated.proto -o "$PROTO_DIR/k8s.io/apimachinery/pkg/api/resource/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/apimachinery/master/pkg/apis/meta/v1/generated.proto -o "$PROTO_DIR/k8s.io/apimachinery/pkg/apis/meta/v1/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/apimachinery/master/pkg/runtime/generated.proto -o "$PROTO_DIR/k8s.io/apimachinery/pkg/runtime/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/apimachinery/master/pkg/runtime/schema/generated.proto -o "$PROTO_DIR/k8s.io/apimachinery/pkg/runtime/schema/generated.proto"
curl -sL https://raw.githubusercontent.com/kubernetes/apimachinery/master/pkg/util/intstr/generated.proto -o "$PROTO_DIR/k8s.io/apimachinery/pkg/util/intstr/generated.proto"

echo "Downloading Google proto files..."
mkdir -p "$PROTO_DIR/google/api"
mkdir -p "$PROTO_DIR/google/protobuf"

curl -sL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto -o "$PROTO_DIR/google/api/annotations.proto"
curl -sL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto -o "$PROTO_DIR/google/api/http.proto"
curl -sL https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/descriptor.proto -o "$PROTO_DIR/google/protobuf/descriptor.proto"
curl -sL https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/empty.proto -o "$PROTO_DIR/google/protobuf/empty.proto"
curl -sL https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/timestamp.proto -o "$PROTO_DIR/google/protobuf/timestamp.proto"

echo "All proto files downloaded successfully!"
