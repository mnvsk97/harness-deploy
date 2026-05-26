SHELL := /bin/bash
PYTHON ?= python3
ENVSUBST := $(shell command -v envsubst 2>/dev/null || command -v /opt/homebrew/bin/envsubst 2>/dev/null || command -v /opt/homebrew/opt/gettext/bin/envsubst 2>/dev/null || command -v /usr/local/bin/envsubst 2>/dev/null)
TFY := $(shell command -v tfy 2>/dev/null || command -v /opt/homebrew/bin/tfy 2>/dev/null || command -v /usr/local/bin/tfy 2>/dev/null)

ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: render-codex deploy-codex render-codex-slack deploy-codex-slack create-codex-slack-app render-claude-code deploy-claude-code render-claude-code-slack deploy-claude-code-slack create-claude-code-slack-app render-hermes-agent deploy-hermes-agent render-slack-bridge deploy-slack-bridge create-slack-app render-pi deploy-pi render-pi-slack deploy-pi-slack create-pi-slack-app render-goose deploy-goose render-goose-slack deploy-goose-slack create-goose-slack-app render-openswe-secrets deploy-openswe-secrets render-openswe deploy-openswe render-openswe-slack deploy-openswe-slack create-openswe-slack-app clean-rendered

GOOSE_MODEL ?= openai-main/gpt-5.5
GOOSE_API_HOST ?= goose-api$(patsubst hermes-api%,%,$(HERMES_API_HOST))
GOOSE_SECRET_GROUP ?= goose-api-secrets
GOOSE_STORAGE_CLASS ?= managed-csi-premium
GOOSE_SLACK_HOST ?= goose-slack$(patsubst goose-api%,%,$(GOOSE_API_HOST))
GOOSE_SLACK_SECRET_GROUP ?= goose-slack-gateway-secrets
GOOSE_SLACK_APP_NAME ?= Goose
GOOSE_SLACK_STORAGE_CLASS ?= $(GOOSE_STORAGE_CLASS)
GOOSE_SECRET_INTEGRATION_FQN ?= tenant:provider:cluster:secret-store:name
GOOSE_SECRET_ADMIN_EMAIL ?= admin@example.com
GOOSE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$GOOSE_SECRET_GROUP $$GOOSE_SECRET_INTEGRATION_FQN $$GOOSE_SECRET_ADMIN_EMAIL $$GOOSE_API_HOST $$GOOSE_MODEL $$GOOSE_STORAGE_CLASS $$DAYTONA_API_KEY'
GOOSE_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$GOOSE_SECRET_GROUP $$GOOSE_API_HOST $$GOOSE_SLACK_HOST $$GOOSE_SLACK_SECRET_GROUP $$GOOSE_SLACK_STORAGE_CLASS'
HERMES_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$CODEX_GATEWAY_SECRET_GROUP $$HERMES_API_HOST'
OPENSWE_SECRET_GROUP ?= openswe-secrets
OPENSWE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$TFY_GATEWAY_SECRET_GROUP $$OPENSWE_SECRET_GROUP $$OPENSWE_API_HOST'
OPENSWE_SLACK_HOST ?= openswe-slack$(patsubst openswe%,%,$(OPENSWE_API_HOST))
OPENSWE_SLACK_SECRET_GROUP ?= openswe-slack-gateway-secrets
OPENSWE_SLACK_APP_NAME ?= Open SWE
OPENSWE_SLACK_STORAGE_CLASS ?= managed-csi-premium
OPENSWE_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$OPENSWE_API_HOST $$OPENSWE_SLACK_HOST $$OPENSWE_SLACK_SECRET_GROUP $$OPENSWE_SLACK_STORAGE_CLASS'
OPENSWE_SECRET_ADMIN_SUBJECT ?= user:admin@example.com
OPENSWE_SECRET_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$OPENSWE_SECRET_GROUP $$OPENSWE_SECRET_INTEGRATION_FQN $$OPENSWE_SECRET_ADMIN_SUBJECT $$DAYTONA_API_KEY'
CODEX_SLACK_HOST ?= codex-slack$(patsubst codex-http-gateway%,%,$(CODEX_GATEWAY_HOST))
CODEX_SLACK_SECRET_GROUP ?= codex-slack-gateway-secrets
CODEX_SLACK_APP_NAME ?= Codex
CODEX_SLACK_STORAGE_CLASS ?= managed-csi-premium
CODEX_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$CODEX_GATEWAY_SECRET_GROUP $$CODEX_GATEWAY_HOST $$CODEX_SLACK_HOST $$CODEX_SLACK_SECRET_GROUP $$CODEX_SLACK_STORAGE_CLASS'
CLAUDE_CODE_SLACK_APP_NAME ?= Donna
CLAUDE_CODE_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$CLAUDE_CODE_SLACK_SECRET_GROUP $$CLAUDE_CODE_GATEWAY_SECRET_GROUP $$CLAUDE_CODE_GATEWAY_URL $$CLAUDE_CODE_SLACK_HOST'
PI_SLACK_HOST ?= pi-slack$(patsubst pi-steppable-gateway%,%,$(PI_GATEWAY_HOST))
PI_SLACK_SECRET_GROUP ?= pi-slack-gateway-secrets
PI_SLACK_APP_NAME ?= Pi
PI_SLACK_STORAGE_CLASS ?= $(PI_STORAGE_CLASS)
PI_SLACK_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$CODEX_GATEWAY_SECRET_GROUP $$PI_GATEWAY_HOST $$PI_SLACK_HOST $$PI_SLACK_SECRET_GROUP $$PI_SLACK_STORAGE_CLASS'
SLACK_BRIDGE_APP_NAME ?= $(SLACK_BRIDGE_HARNESS_NAME) Slack
SLACK_BRIDGE_SERVICE_NAME ?= harness-slack-bridge
SLACK_BRIDGE_AUTH_HEADER ?= authorization
SLACK_BRIDGE_AUTH_SCHEME ?= Bearer
SLACK_BRIDGE_BODY_PROFILE ?= generic
SLACK_BRIDGE_SEND_INITIAL_MESSAGE_AFTER_CREATE ?= false
SLACK_BRIDGE_WORKING_DIR ?= /data/workspaces/slack
export SLACK_BRIDGE_APP_NAME
export SLACK_BRIDGE_SERVICE_NAME
SLACK_BRIDGE_ENVSUBST_VARS := '$$TFY_WORKSPACE_FQN $$HARNESS_DEPLOY_ROOT $$TFY_SECRET_TENANT $$SLACK_SECRET_GROUP $$SLACK_BRIDGE_SERVICE_NAME $$SLACK_BRIDGE_HOST $$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$SLACK_BRIDGE_HARNESS_API_URL $$SLACK_BRIDGE_TARGET_SECRET_GROUP $$SLACK_BRIDGE_TARGET_TOKEN_KEY $$SLACK_BRIDGE_AUTH_HEADER $$SLACK_BRIDGE_AUTH_SCHEME $$SLACK_BRIDGE_BODY_PROFILE $$SLACK_BRIDGE_SEND_INITIAL_MESSAGE_AFTER_CREATE $$SLACK_BRIDGE_WORKING_DIR $$SLACK_BRIDGE_SESSION_CREATE_PATH $$SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE $$SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE $$SLACK_BRIDGE_POLL_EVENTS'

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

render-codex-slack:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(CODEX_SLACK_SECRET_GROUP)" || (echo "CODEX_SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(CODEX_SLACK_HOST)" || (echo "CODEX_SLACK_HOST is required. Set it in .env." && exit 1)
	@test -n "$(CODEX_GATEWAY_HOST)" || (echo "CODEX_GATEWAY_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/codex
	$(ENVSUBST) $(CODEX_SLACK_ENVSUBST_VARS) < harnesses/codex/deployments/template/slack-volume.yaml > .rendered/codex/slack-volume.yaml
	$(ENVSUBST) $(CODEX_SLACK_ENVSUBST_VARS) < harnesses/codex/deployments/template/slack-service.yaml > .rendered/codex/slack-service.yaml
	if [ -f harnesses/codex/deployments/template/.env ]; then set -a; . harnesses/codex/deployments/template/.env; set +a; fi; \
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(CODEX_SLACK_HOST)}" \
	SLACK_BRIDGE_APP_NAME="$(CODEX_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="codex" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/codex/slack-app-manifest.json

deploy-codex-slack: render-codex-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/codex/slack-volume.yaml
	$(TFY) deploy -f .rendered/codex/slack-service.yaml --no-wait --force

create-codex-slack-app: render-codex-slack
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/codex/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/codex/slack-app-create-response.json

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
	if [ -f harnesses/claude-code/deployments/template/.env ]; then set -a; . harnesses/claude-code/deployments/template/.env; set +a; fi; \
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(CLAUDE_CODE_SLACK_HOST)}" \
	SLACK_BRIDGE_APP_NAME="$(CLAUDE_CODE_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="claude-code" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/claude-code/slack-app-manifest.json

deploy-claude-code-slack: render-claude-code-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/claude-code/slack-volume.yaml
	$(TFY) deploy -f .rendered/claude-code/slack-service.yaml --no-wait --force

create-claude-code-slack-app: render-claude-code-slack
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/claude-code/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/claude-code/slack-app-create-response.json

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
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(SLACK_BRIDGE_HOST)}" $(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/slack/slack-app-manifest.json

deploy-slack-bridge: render-slack-bridge
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) deploy -f .rendered/slack/bridge-service.yaml --no-wait --force

create-slack-app: render-slack-bridge
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/slack/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/slack/slack-app-create-response.json

render-pi:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	mkdir -p .rendered/pi
	$(ENVSUBST) < harnesses/pi/deployments/template/volume.yaml > .rendered/pi/volume.yaml
	$(ENVSUBST) < harnesses/pi/deployments/template/service.yaml > .rendered/pi/service.yaml

deploy-pi: render-pi
	tfy apply -f .rendered/pi/volume.yaml
	tfy deploy -f .rendered/pi/service.yaml --no-wait --force

render-pi-slack:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(PI_SLACK_SECRET_GROUP)" || (echo "PI_SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(PI_SLACK_HOST)" || (echo "PI_SLACK_HOST is required. Set it in .env." && exit 1)
	@test -n "$(PI_GATEWAY_HOST)" || (echo "PI_GATEWAY_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/pi
	$(ENVSUBST) $(PI_SLACK_ENVSUBST_VARS) < harnesses/pi/deployments/template/slack-volume.yaml > .rendered/pi/slack-volume.yaml
	$(ENVSUBST) $(PI_SLACK_ENVSUBST_VARS) < harnesses/pi/deployments/template/slack-service.yaml > .rendered/pi/slack-service.yaml
	if [ -f harnesses/pi/deployments/template/.env ]; then set -a; . harnesses/pi/deployments/template/.env; set +a; fi; \
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(PI_SLACK_HOST)}" \
	SLACK_BRIDGE_APP_NAME="$(PI_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="pi" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/pi/slack-app-manifest.json

deploy-pi-slack: render-pi-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/pi/slack-volume.yaml
	$(TFY) deploy -f .rendered/pi/slack-service.yaml --no-wait --force

create-pi-slack-app: render-pi-slack
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/pi/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/pi/slack-app-create-response.json

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

render-goose-slack:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(GOOSE_SLACK_SECRET_GROUP)" || (echo "GOOSE_SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(GOOSE_SLACK_HOST)" || (echo "GOOSE_SLACK_HOST is required. Set it in .env." && exit 1)
	@test -n "$(GOOSE_API_HOST)" || (echo "GOOSE_API_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/goose
	$(ENVSUBST) $(GOOSE_SLACK_ENVSUBST_VARS) < harnesses/goose/deployments/template/slack-volume.yaml > .rendered/goose/slack-volume.yaml
	$(ENVSUBST) $(GOOSE_SLACK_ENVSUBST_VARS) < harnesses/goose/deployments/template/slack-service.yaml > .rendered/goose/slack-service.yaml
	if [ -f harnesses/goose/deployments/template/.env ]; then set -a; . harnesses/goose/deployments/template/.env; set +a; fi; \
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(GOOSE_SLACK_HOST)}" \
	SLACK_BRIDGE_APP_NAME="$(GOOSE_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="goose" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/goose/slack-app-manifest.json

deploy-goose-slack: render-goose-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/goose/slack-volume.yaml
	$(TFY) deploy -f .rendered/goose/slack-service.yaml --no-wait --force

create-goose-slack-app: render-goose-slack
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/goose/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/goose/slack-app-create-response.json

render-openswe-secrets:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(OPENSWE_SECRET_GROUP)" || (echo "OPENSWE_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(OPENSWE_SECRET_INTEGRATION_FQN)" || (echo "OPENSWE_SECRET_INTEGRATION_FQN is required. Set it in .env." && exit 1)
	@test -n "$(OPENSWE_SECRET_ADMIN_SUBJECT)" || (echo "OPENSWE_SECRET_ADMIN_SUBJECT is required. Set it in .env." && exit 1)
	@test -n "$(DAYTONA_API_KEY)" || (echo "DAYTONA_API_KEY is required. Set it in .env." && exit 1)
	mkdir -p .rendered/openswe
	$(ENVSUBST) $(OPENSWE_SECRET_ENVSUBST_VARS) < harnesses/openswe/deployments/template/secret-group.example.yaml > .rendered/openswe/secret-group.yaml

deploy-openswe-secrets: render-openswe-secrets
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/openswe/secret-group.yaml

render-openswe:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(OPENSWE_API_HOST)" || (echo "OPENSWE_API_HOST is required. Set it in .env." && exit 1)
	@test -n "$(OPENSWE_SECRET_GROUP)" || (echo "OPENSWE_SECRET_GROUP is required. Set it in .env." && exit 1)
	mkdir -p .rendered/openswe
	$(ENVSUBST) $(OPENSWE_ENVSUBST_VARS) < harnesses/openswe/deployments/template/service.yaml > .rendered/openswe/service.yaml

deploy-openswe: render-openswe
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) deploy -f .rendered/openswe/service.yaml --no-wait --force

render-openswe-slack:
	@test -n "$(ENVSUBST)" || (echo "envsubst not found. Install gettext or add envsubst to PATH." && exit 1)
	@test -n "$(OPENSWE_SLACK_SECRET_GROUP)" || (echo "OPENSWE_SLACK_SECRET_GROUP is required. Set it in .env." && exit 1)
	@test -n "$(OPENSWE_SLACK_HOST)" || (echo "OPENSWE_SLACK_HOST is required. Set it in .env." && exit 1)
	@test -n "$(OPENSWE_API_HOST)" || (echo "OPENSWE_API_HOST is required. Set it in .env." && exit 1)
	mkdir -p .rendered/openswe
	$(ENVSUBST) $(OPENSWE_SLACK_ENVSUBST_VARS) < harnesses/openswe/deployments/template/slack-volume.yaml > .rendered/openswe/slack-volume.yaml
	$(ENVSUBST) $(OPENSWE_SLACK_ENVSUBST_VARS) < harnesses/openswe/deployments/template/slack-service.yaml > .rendered/openswe/slack-service.yaml
	if [ -f harnesses/openswe/deployments/template/.env ]; then set -a; . harnesses/openswe/deployments/template/.env; set +a; fi; \
	HARNESS_API_URL="$${HARNESS_API_URL:-https://$(OPENSWE_SLACK_HOST)}" \
	SLACK_BRIDGE_APP_NAME="$(OPENSWE_SLACK_APP_NAME)" \
	SLACK_BRIDGE_HARNESS_NAME="openswe" \
	$(ENVSUBST) '$$SLACK_BRIDGE_APP_NAME $$SLACK_BRIDGE_HARNESS_NAME $$HARNESS_API_URL' < shared/slack/slack-app-manifest.template.json > .rendered/openswe/slack-app-manifest.json

deploy-openswe-slack: render-openswe-slack
	@test -n "$(TFY)" || (echo "tfy not found. Install TrueFoundry CLI or add tfy to PATH." && exit 1)
	$(TFY) apply -f .rendered/openswe/slack-volume.yaml
	$(TFY) deploy -f .rendered/openswe/slack-service.yaml --no-wait --force

create-openswe-slack-app: render-openswe-slack
	@test -n "$$SLACK_APP_CONFIG_TOKEN" || (echo "SLACK_APP_CONFIG_TOKEN is required. Generate a Slack app configuration token and set it in root .env or the shell." && exit 1)
	$(PYTHON) scripts/create_slack_app.py .rendered/openswe/slack-app-manifest.json --token "$$SLACK_APP_CONFIG_TOKEN" $${SLACK_TEAM_ID:+--team-id "$$SLACK_TEAM_ID"} --out .rendered/openswe/slack-app-create-response.json
