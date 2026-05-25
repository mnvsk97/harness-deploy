SHELL := /bin/bash
ENVSUBST := $(shell command -v envsubst 2>/dev/null || command -v /opt/homebrew/bin/envsubst 2>/dev/null || command -v /opt/homebrew/opt/gettext/bin/envsubst 2>/dev/null || command -v /usr/local/bin/envsubst 2>/dev/null)
TFY := $(shell command -v tfy 2>/dev/null || command -v /opt/homebrew/bin/tfy 2>/dev/null || command -v /usr/local/bin/tfy 2>/dev/null)

ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: render-codex deploy-codex render-claude-code deploy-claude-code render-claude-code-slack deploy-claude-code-slack render-hermes-agent deploy-hermes-agent render-slack-bridge deploy-slack-bridge render-pi deploy-pi render-goose deploy-goose render-openswe deploy-openswe clean-rendered

GOOSE_MODEL ?= openai-main/gpt-5.5
GOOSE_API_HOST ?= goose-api$(patsubst hermes-api%,%,$(HERMES_API_HOST))
GOOSE_SECRET_GROUP ?= goose-api-secrets
GOOSE_STORAGE_CLASS ?= managed-csi-premium
GOOSE_SECRET_INTEGRATION_FQN ?= tenant:provider:cluster:secret-store:name
GOOSE_SECRET_ADMIN_EMAIL ?= admin@example.com
GOOSE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$GOOSE_SECRET_GROUP $$GOOSE_SECRET_INTEGRATION_FQN $$GOOSE_SECRET_ADMIN_EMAIL $$GOOSE_API_HOST $$GOOSE_MODEL $$GOOSE_STORAGE_CLASS'
HERMES_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$CODEX_GATEWAY_SECRET_GROUP $$HERMES_API_HOST'
OPENSWE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$OPENSWE_API_HOST'
CLAUDE_CODE_SLACK_APP_NAME ?= Donna
CLAUDE_CODE_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$CLAUDE_CODE_SLACK_SECRET_GROUP $$CLAUDE_CODE_GATEWAY_SECRET_GROUP $$CLAUDE_CODE_GATEWAY_URL $$CLAUDE_CODE_SLACK_HOST'
SLACK_BRIDGE_APP_NAME ?= $(SLACK_BRIDGE_HARNESS_NAME) Slack
SLACK_BRIDGE_SERVICE_NAME ?= harness-slack-bridge
export SLACK_BRIDGE_APP_NAME
export SLACK_BRIDGE_SERVICE_NAME
SLACK_BRIDGE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$SLACK_SECRET_GROUP $$SLACK_BRIDGE_SERVICE_NAME $$SLACK_BRIDGE_HOST $$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$SLACK_BRIDGE_HARNESS_API_URL $$SLACK_BRIDGE_TARGET_SECRET_GROUP $$SLACK_BRIDGE_TARGET_TOKEN_KEY $$SLACK_BRIDGE_SESSION_CREATE_PATH $$SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE $$SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE $$SLACK_BRIDGE_POLL_EVENTS'

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

render-claude-code-slack:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(CLAUDE_CODE_SLACK_SECRET_GROUP)" || (echo "CLAUDE_CODE_SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(CLAUDE_CODE_SLACK_HOST)" || (echo "CLAUDE_CODE_SLACK_HOST is required. Set it in .env." && exit 1)
	@test -n "$(CLAUDE_CODE_GATEWAY_URL)" || (echo "CLAUDE_CODE_GATEWAY_URL is required. Set it in .env." && exit 1)
	mkdir -p .rendered/claude-code
	$(ENVSUBST) $(CLAUDE_CODE_SLACK_ENVSUBST_VARS) < harnesses/claude-code/deployments/template/slack-volume.yaml > .rendered/claude-code/slack-volume.yaml
	$(ENVSUBST) $(CLAUDE_CODE_SLACK_ENVSUBST_VARS) < harnesses/claude-code/deployments/template/slack-service.yaml > .rendered/claude-code/slack-service.yaml
	SLACK_BRIDGE_APP_NAME="$(CLAUDE_CODE_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="claude-code" \
	SLACK_BRIDGE_HOST="$(CLAUDE_CODE_SLACK_HOST)" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$SLACK_BRIDGE_HOST' < shared/slack/slack-app-manifest.template.json > .rendered/claude-code/slack-app-manifest.json

deploy-claude-code-slack: render-claude-code-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/claude-code/slack-volume.yaml
	$(TFY) deploy -f .rendered/claude-code/slack-service.yaml --no-wait --force

render-hermes-agent:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/hermes-agent
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/volume.yaml > .rendered/hermes-agent/volume.yaml
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/api-service.yaml > .rendered/hermes-agent/api-service.yaml
	$(ENVSUBST) $(HERMES_ENVSUBST_VARS) < harnesses/hermes-agent/deployments/template/backup-job.yaml > .rendered/hermes-agent/backup-job.yaml

deploy-hermes-agent: render-hermes-agent
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/hermes-agent/volume.yaml
	$(TFY) deploy -f .rendered/hermes-agent/api-service.yaml --no-wait --force

smoke-hermes-agent:
	@test -n "$(HERMES_API_TOKEN)" || (echo "HERMES_API_TOKEN is required. Use the CODEX-GATEWAY-BEARER-TOKEN value." && exit 1)
	HERMES_API_HOST="$(HERMES_API_HOST)" HERMES_API_TOKEN="$(HERMES_API_TOKEN)" \
		bash harnesses/hermes-agent/deployments/template/smoke-test.sh

render-slack-bridge:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(TFY_WORKSPACE_FQN)" || (echo "TFY_WORKSPACE_FQN is required. Set it in .env." && exit 1)
	@test -n "$(HARNESS_DEPLOY_ROOT)" || (echo "HARNESS_DEPLOY_ROOT is required. Set it in .env." && exit 1)
	@test -n "$(TFY_SECRET_TENANT)" || (echo "TFY_SECRET_TENANT is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_SECRET_GROUP)" || (echo "SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_HOST)" || (echo "SLACK_BRIDGE_HOST is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_HARNESS_NAME)" || (echo "SLACK_BRIDGE_HARNESS_NAME is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_HARNESS_API_URL)" || (echo "SLACK_BRIDGE_HARNESS_API_URL is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_TARGET_SECRET_GROUP)" || (echo "SLACK_BRIDGE_TARGET_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_TARGET_TOKEN_KEY)" || (echo "SLACK_BRIDGE_TARGET_TOKEN_KEY is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_SESSION_CREATE_PATH)" || (echo "SLACK_BRIDGE_SESSION_CREATE_PATH is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE)" || (echo "SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE)" || (echo "SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE is required. Set it in .env." && exit 1)
	@test -n "$(SLACK_BRIDGE_POLL_EVENTS)" || (echo "SLACK_BRIDGE_POLL_EVENTS is required. Set it in .env." && exit 1)
	mkdir -p .rendered/slack
	$(ENVSUBST) $(SLACK_BRIDGE_ENVSUBST_VARS) < shared/slack/bridge-service.template.yaml > .rendered/slack/bridge-service.yaml
	$(ENVSUBST) $(SLACK_BRIDGE_ENVSUBST_VARS) < shared/slack/slack-app-manifest.template.json > .rendered/slack/slack-app-manifest.json

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

render-openswe:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(OPENSWE_API_HOST)" || (echo "OPENSWE_API_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/openswe
	$(ENVSUBST) $(OPENSWE_ENVSUBST_VARS) < harnesses/openswe/deployments/template/service.yaml > .rendered/openswe/service.yaml

deploy-openswe: render-openswe
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) deploy -f .rendered/openswe/service.yaml --no-wait --force
