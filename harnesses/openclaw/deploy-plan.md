# OpenClaw Deploy Plan

## Repo Findings

- Runtime: Node 24 / pnpm monorepo.
- Upstream Dockerfile: yes.
- Compose service: `openclaw-gateway`.
- Entrypoint: `tini -s -- node openclaw.mjs gateway`.
- Compose command override: `node dist/index.js gateway --bind lan --port 18789`.
- Ports: `18789` gateway, optional `18790` bridge.
- Health: `GET /healthz`, `GET /readyz`.
- Persistent paths:
  - `/home/node/.openclaw`
  - `/home/node/.openclaw/workspace`
  - `/home/node/.config/openclaw`
- Important env:
  - `OPENCLAW_GATEWAY_TOKEN`
  - `OPENCLAW_STATE_DIR`
  - `OPENCLAW_CONFIG_PATH`
  - `OPENCLAW_WORKSPACE_DIR`
  - model/provider keys such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
  - channel tokens such as `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`

## TrueFoundry Mapping

- Primary component: `Service`.
- State: `Volume`.
- Credentials: `SecretGroup`.
- Optional registration: `MCPServer` only if exposing OpenClaw as a tool endpoint later.
- Avoid running multiple replicas unless each replica has isolated state.

## Deployment Steps

1. Create the secret group and fill provider/channel keys.
2. Create the volume for `/home/node/.openclaw`.
3. Apply `manifests/service.yaml`.
4. Confirm `/healthz` returns 200.
5. Configure only one trusted channel first.
6. Record channel-specific gaps in `compatibility.md`.

