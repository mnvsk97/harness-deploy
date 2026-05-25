# Hermes Agent Deploy Plan

## Repo Findings

- Runtime: Python via `uv`, Node/npm for web/TUI assets.
- Upstream Dockerfile: yes.
- Compose services: `gateway` and optional `dashboard`.
- Default Docker volume: `/opt/data`.
- Entrypoint: `/opt/hermes/docker/entrypoint.sh`, then `hermes <subcommand>`.
- Main long-running command: `gateway run`.
- Optional dashboard: controlled by `HERMES_DASHBOARD=1`; default port `9119`.
- Optional OpenAI-compatible API server: requires `API_SERVER_HOST=0.0.0.0` and `API_SERVER_KEY`.
- Important env:
  - `HERMES_HOME=/opt/data`
  - `HERMES_UID`, `HERMES_GID`
  - `HERMES_AUTH_JSON_BOOTSTRAP`
  - provider keys such as `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
  - messaging tokens such as Telegram/Discord/Slack/WhatsApp settings

## TrueFoundry Mapping

- Primary component: `Service`.
- State: `Volume` mounted at `/opt/data`.
- Credentials: `SecretGroup`.
- Optional service port: `9119` dashboard or API server port if enabled.
- Slack: use an HTTP Events bridge with an exposed webhook. Socket Mode is not
  supported in this project.
- Use one replica because state is file-backed and gateway-oriented.

## Deployment Steps

1. Create `hermes-secrets`.
2. Create `hermes-state` volume.
3. Apply `service.yaml` for `hermes gateway run`.
4. Keep dashboard/API disabled until gateway works.
5. Enable `dashboard-service.yaml` later if desired.
6. Record whether external channel setup works.

For Slack:

1. Apply the Slack `SecretGroup`.
2. Deploy the Hermes API service with `make deploy-hermes-agent`.
3. Configure `shared/slack` to call the Hermes API URL.
4. Render the Slack app manifest and deploy the HTTP bridge with
   `make render-slack-bridge` and `make deploy-slack-bridge`.
