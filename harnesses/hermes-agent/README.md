# Hermes Agent on TrueFoundry

Repo inspected: `https://github.com/NousResearch/hermes-agent` at `9c08070`.

Hermes ships a Dockerfile and compose setup. The durable runtime is the gateway
process plus optional dashboard/API server. It stores state under `HERMES_HOME`,
which defaults to `/opt/data` in Docker.

This harness has two deployable service templates:

- `deployments/template/api-service.yaml`: OpenAI-compatible API server mode.
- `deployments/template/slack-service.yaml`: legacy Slack worker template.

Slack Socket Mode is not supported for this project. Deploy Slack integrations
through an HTTP Events bridge with an exposed webhook.
