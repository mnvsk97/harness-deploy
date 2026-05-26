# Pi Steppable Deploy

This deployment exposes Pi as a durable HTTP/SSE service using Pi's
`steppable-rpc` mode. It intentionally avoids a PTY wrapper.

The gateway drives Pi through explicit boundaries:

- `call_llm`
- `call_tool`
- `wait_for_user`
- persisted snapshots

Render and deploy:

```bash
make deploy-pi
```

Endpoint:

```text
https://${PI_GATEWAY_HOST}
```

API:

```bash
curl -X POST https://$PI_GATEWAY_HOST/v1/agents/pi/sessions \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Create a README that explains this repository structure."}'
```

```bash
curl -X POST https://$PI_GATEWAY_HOST/v1/sessions/$SESSION_ID/events \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Continue and include deployment risks."}'
```

```bash
curl -N https://$PI_GATEWAY_HOST/v1/sessions/$SESSION_ID/stream \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN"
```

Notes:

- `GATEWAY_BEARER_TOKEN` reuses the Codex gateway bearer-token secret.
- Model calls are routed through the TrueFoundry Gateway secret group.
- The service uses a block volume and one replica because the current gateway
  persists snapshots, event logs, Pi state, and workspace files on the mounted
  volume.
- The current gateway executes Pi tools in the service workspace. For untrusted
  user workloads, add an external sandbox worker before exposing this broadly.

## Slack bridge

Pi uses the same shared Slack HTTP Events bridge as Claude Code. The per-harness
Slack template points the bridge at:

- `POST /v1/agents/pi/sessions`
- `POST /v1/sessions/{session_id}/events`
- `GET /v1/sessions/{session_id}/events`

Use a separate Slack app/bot for Pi. Do not reuse Donna's Claude Code bot token.
Store the Pi app credentials in `${PI_SLACK_SECRET_GROUP}`.

Render and deploy:

```bash
make render-pi-slack
make deploy-pi-slack
```

Create or update the Slack app from this copy-paste manifest:

```text
harnesses/pi/deployments/template/slack-app-manifest.editable.json
```

Before pasting, copy the harness-local env example to `.env` and set
`HARNESS_API_URL` to the public Slack bridge URL:

```text
harnesses/pi/deployments/template/.env
```

The editable manifest uses `${HARNESS_API_URL}/slack/events`. If you run
`make render-pi-slack`, that harness-local `.env` value is used for
`.rendered/pi/slack-app-manifest.json`.
