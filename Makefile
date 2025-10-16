# Simple Makefile for Docker builds

# Usage overrides: make build IMAGE=yourrepo/segment:tag
DOCKER ?= docker
IMAGE  ?= segment:latest
BUILD_ARGS ?=
CONTEXT ?= .

.PHONY: help build build-nc tag build-tag push

help:
	@echo "make build                 # Build image ($(IMAGE))"
	@echo "make build-nc              # Build with --no-cache"
	@echo "make tag TAG=x             # Tag current image as x"
	@echo "make build-tag TAG=x       # Build and tag in one step"
	@echo "make push                  # Push image to registry"

build:
	$(DOCKER) build $(BUILD_ARGS) -t $(IMAGE) $(CONTEXT)

build-nc:
	$(DOCKER) build --no-cache $(BUILD_ARGS) -t $(IMAGE) $(CONTEXT)

# Example: make tag TAG=yourrepo/segment:1.0.0
TAG ?=

tag:
	@test -n "$(TAG)" || (echo "TAG is required" && exit 1)
	$(DOCKER) tag $(IMAGE) $(TAG)

build-tag: build tag

push:
	$(DOCKER) push $(IMAGE)

