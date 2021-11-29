#!/bin/sh

echo "Docker image: $REGISTRY_IMAGE_NAME:$TAG"

docker build \
  --build-arg BUILD_NUMBER=$CI_PIPELINE_ID \
  -t $REGISTRY_HOSTNAME/$REGISTRY_IMAGE_NAME:$TAG \
  -f Dockerfile .