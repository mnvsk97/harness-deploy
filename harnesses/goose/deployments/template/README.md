# Goose Server on TrueFoundry

This deployment builds a small server image for Goose's `goosed agent` binary
because the upstream Goose Dockerfile currently ships only the `goose` CLI.

## Components

- `goose-state-block`: block volume mounted at `/data`.
- `${GOOSE_SECRET_GROUP}`: Goose server auth secret.
- `goose-api`: `goosed agent` listening on HTTP port `3000`.
- Daytona MCP extension: per-session sandbox tools exposed to Goose through
  stdio MCP.

## Model Routing

The service uses Goose's built-in OpenAI-compatible provider and points it at
the existing TrueFoundry Gateway secrets through `OPENAI_HOST` and
`OPENAI_API_KEY`. `OPENAI_BASE_PATH` is pinned to `/v1/chat/completions` so
Goose does not auto-route GPT-5-family models to the Responses API.

- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL`
- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY`

The external Goose server secret is independent from the Codex and Hermes API
tokens:

- `tfy-secret://${TFY_SECRET_TENANT}:${GOOSE_SECRET_GROUP}:GOOSE-SERVER-SECRET-KEY`
- `tfy-secret://${TFY_SECRET_TENANT}:${GOOSE_SECRET_GROUP}:DAYTONA-API-KEY`

The secret group is created against `${GOOSE_SECRET_INTEGRATION_FQN}`.
`${GOOSE_SECRET_ADMIN_EMAIL}` is granted `secret-group-admin` on the generated
group.

## Apply Order

```bash
make render-goose
tfy apply -f .rendered/goose/secret-group.yaml
tfy apply -f .rendered/goose/volume.yaml --dry-run --show-diff
make deploy-goose
```

The Goose service uses a local source-build manifest, so deploy it with
`tfy deploy`; this TrueFoundry CLI version does not provide a service dry-run
for that path.

The manifest sets `local_build: false` so TrueFoundry builds remotely instead
of requiring Docker on the machine running `make deploy-goose`.

Smoke test:

```bash
curl -i https://$GOOSE_API_HOST/status
curl -i https://$GOOSE_API_HOST/system_info -H "X-Secret-Key: $GOOSE_SERVER_SECRET_KEY"
```

Keep MCP registration separate until the deployed endpoint is intentionally
exposed through a supported remote MCP transport.

## Slack bridge

Goose uses the same shared Slack HTTP Events bridge as Claude Code, with a
Goose-specific compatibility profile. The bridge uses `X-Secret-Key`, starts a
Goose session, sends the first Slack message to the new session, then polls the
session event stream:

- `POST /agent/start`
- `POST /sessions/{session_id}/reply`
- `GET /sessions/{session_id}/events`

Use a separate Slack app/bot for Goose. Do not reuse Donna's Claude Code bot
token. Store the Goose app credentials in `${GOOSE_SLACK_SECRET_GROUP}`.

Render and deploy:

```bash
make render-goose-slack
make deploy-goose-slack
```

Create or update the Slack app from this copy-paste manifest:

```text
harnesses/goose/deployments/template/slack-app-manifest.editable.json
```

Before pasting, copy the harness-local env example to `.env` and set
`HARNESS_API_URL` to the public Slack bridge URL:

```text
harnesses/goose/deployments/template/.env
```

The editable manifest uses `${HARNESS_API_URL}/slack/events`. If you run
`make render-goose-slack`, that harness-local `.env` value is used for
`.rendered/goose/slack-app-manifest.json`.
