# Codex Deploy

Copy the root env example and set environment-specific values:

```bash
cp .env.example .env
```

Required secret references after rendering:

```text
tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY
tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL
```

Render and apply the one-shot job:

```bash
make render-codex

tfy apply -f .rendered/codex/job.yaml --dry-run --show-diff
tfy apply -f .rendered/codex/job.yaml
```

This deploys a manual job that runs:

```bash
codex exec --sandbox workspace-write "Say exactly: codex-ok"
```

## App-server HTTP gateway

This deployment also includes a sessionful HTTP/SSE gateway around
`codex app-server`:

```text
https://${CODEX_GATEWAY_HOST}
```

Render and deploy the session gateway:

```bash
make deploy-codex
```

The gateway uses a block volume because Codex app-server stores SQLite state.
The service rollout strategy uses `max_surge_percentage: 0` because the block
volume is `ReadWriteOnce`.

The deployment sets `CODEX_SANDBOX=danger-full-access` inside the container.
TrueFoundry provides the outer isolation boundary through the pod and mounted
workspace volume; Codex's Linux bubblewrap sandbox does not reliably initialize
inside this Kubernetes runtime.

API:

```bash
curl -X POST https://$CODEX_GATEWAY_HOST/sessions \
  -H "authorization: Bearer $CODEX_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"model":"openai-main/gpt-5.5"}'
```

```bash
curl -X POST https://$CODEX_GATEWAY_HOST/sessions/$THREAD_ID/messages \
  -H "authorization: Bearer $CODEX_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Say exactly: codex-ok"}'
```

```bash
curl -N https://$CODEX_GATEWAY_HOST/sessions/$THREAD_ID/events \
  -H "authorization: Bearer $CODEX_GATEWAY_TOKEN"
```

Current smoke-test result:

- Gateway health and readiness return 200.
- Empty session creation works.
- A real Codex turn through TrueFoundry Gateway completed successfully with
  response `codex-ok`.
- The app-server gateway is configured through Codex `config.toml` to use the
  TrueFoundry Gateway base URL secret with `openai-main/gpt-5.5`.

## Slack bridge

Codex uses the same shared Slack HTTP Events bridge as Claude Code. The
per-harness Slack template points the bridge at:

- `POST /sessions`
- `POST /sessions/{session_id}/messages`
- `GET /sessions/{session_id}/events`

Use a separate Slack app/bot for Codex. Do not reuse Donna's Claude Code bot
token. Store the Codex app credentials in `${CODEX_SLACK_SECRET_GROUP}`.

Render and deploy:

```bash
make render-codex-slack
make deploy-codex-slack
```

Create or update the Slack app from this copy-paste manifest:

```text
harnesses/codex/deployments/template/slack-app-manifest.editable.json
```

Before pasting, copy the harness-local env example to `.env` and set
`HARNESS_API_URL` to the public Slack bridge URL:

```text
harnesses/codex/deployments/template/.env
```

The editable manifest uses `${HARNESS_API_URL}/slack/events`. If you run
`make render-codex-slack`, that harness-local `.env` value is used for
`.rendered/codex/slack-app-manifest.json`.
