SHELL := /bin/bash
ENVSUBST := $(shell command -v envsubst 2>/dev/null || command -v /opt/homebrew/bin/envsubst 2>/dev/null || command -v /opt/homebrew/opt/gettext/bin/envsubst 2>/dev/null || command -v /usr/local/bin/envsubst 2>/dev/null)
TFY := $(shell command -v tfy 2>/dev/null || command -v /opt/homebrew/bin/tfy 2>/dev/null || command -v /usr/local/bin/tfy 2>/dev/null)

ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: render-codex deploy-codex render-claude-code deploy-claude-code render-hermes-agent deploy-hermes-agent render-hermes-agent-slack deploy-hermes-agent-slack render-slack-bridge deploy-slack-bridge render-pi deploy-pi render-goose deploy-goose clean-rendered

GOOSE_MODEL ?= openai-main/gpt-5.5
GOOSE_API_HOST ?= goose-api$(patsubst hermes-api%,%,$(HERMES_API_HOST))
GOOSE_SECRET_GROUP ?= goose-api-secrets
GOOSE_STORAGE_CLASS ?= managed-csi-premium
GOOSE_SECRET_INTEGRATION_FQN ?= tenant:provider:cluster:secret-store:name
GOOSE_SECRET_ADMIN_EMAIL ?= admin@example.com
GOOSE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$GOOSE_SECRET_GROUP $$GOOSE_SECRET_INTEGRATION_FQN $$GOOSE_SECRET_ADMIN_EMAIL $$GOOSE_API_HOST $$GOOSE_MODEL $$GOOSE_STORAGE_CLASS'
HERMES_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$CODEX_GATEWAY_SECRET_GROUP $$HERMES_API_HOST'

clean-rendered:
	rm -rf .rendered

render-codex:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/codex
	$(ENVSUBST) < harnesses/codex/deployments/template/volume.yaml > .rendered/codex/volume.yaml
	$(ENVSUBST) < harnesses/codex/deployments/template/job.yaml > .rendered/codex/job.yaml
	$(ENVSUBST) < harnesses/codex/deployments/template/app-server-gateway.yaml > .rendered/codex/app-server-gateway.yaml

deploy-codex: render-codex
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/codex/volume.yaml
	$(TFY) deploy -f .rendered/codex/app-server-gateway.yaml --no-wait --force

render-claude-code:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/claude-code
	$(ENVSUBST) < harnesses/claude-code/deployments/template/volume.yaml > .rendered/claude-code/volume.yaml
	$(ENVSUBST) < harnesses/claude-code/deployments/template/service.yaml > .rendered/claude-code/service.yaml

deploy-claude-code: render-claude-code
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/claude-code/volume.yaml
	$(TFY) deploy -f .rendered/claude-code/service.yaml --no-wait --force

render-hermes-agent:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/hermes-agent
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/volume.yaml > .rendered/hermes-agent/volume.yaml
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/api-service.yaml > .rendered/hermes-agent/api-service.yaml
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/backup-job.yaml > .rendered/hermes-agent/backup-job.yaml
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/slack-service.yaml > .rendered/hermes-agent/slack-service.yaml

deploy-hermes-agent: render-hermes-agent
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/hermes-agent/volume.yaml
	$(TFY) deploy -f .rendered/hermes-agent/api-service.yaml --no-wait --force

smoke-hermes-agent:
	@test -n "$(HERMES_API_TOKEN)" || (echo "HERMES_API_TOKEN is required. Use the CODEX-GATEWAY-BEARER-TOKEN value." && exit 1)
	HERMES_API_HOST="$(HERMES_API_HOST)" HERMES_API_TOKEN="$(HERMES_API_TOKEN)" \
		bash harnesses/hermes-agent/deployments/template/smoke-test.sh

render-hermes-agent-slack: render-hermes-agent

deploy-hermes-agent-slack: render-hermes-agent-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/hermes-agent/volume.yaml
	$(TFY) deploy -f .rendered/hermes-agent/slack-service.yaml --no-wait --force

render-slack-bridge:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/slack
	$(ENVSUBST) < shared/slack/bridge-service.template.yaml > .rendered/slack/bridge-service.yaml

deploy-slack-bridge: render-slack-bridge
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) deploy -f .rendered/slack/bridge-service.yaml --no-wait --force

render-pi:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/pi
	$(ENVSUBST) < harnesses/pi/deployments/template/volume.yaml > .rendered/pi/volume.yaml
	$(ENVSUBST) < harnesses/pi/deployments/template/service.yaml > .rendered/pi/service.yaml

deploy-pi: render-pi
	tfy apply -f .rendered/pi/volume.yaml
	tfy deploy -f .rendered/pi/service.yaml --no-wait --force

render-goose:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(GOOSE_API_HOST)" || (echo "GOOSE_API_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/goose
	$(ENVSUBST) $(GOOSE_ENVSUBST_VARS) < harnesses/goose/deployments/template/secret-group.example.yaml > .rendered/goose/secret-group.yaml
	$(ENVSUBST) $(GOOSE_ENVSUBST_VARS) < harnesses/goose/deployments/template/volume.yaml > .rendered/goose/volume.yaml
	$(ENVSUBST) $(GOOSE_ENVSUBST_VARS) < harnesses/goose/deployments/template/api-service.yaml > .rendered/goose/api-service.yaml

deploy-goose: render-goose
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/goose/volume.yaml
	$(TFY) deploy -f .rendered/goose/api-service.yaml --no-wait --force
