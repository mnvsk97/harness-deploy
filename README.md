# harness-deploy

TrueFoundry deployment templates for running agent harnesses and optional Slack
bots.

## Quick Start

Prerequisites:

- TrueFoundry CLI installed and authenticated.
- `envsubst` installed. On macOS, `brew install gettext`.
- `python3` for Slack app creation helpers.

Set repo-level deployment values:

```bash
cp .env.example .env
```

Edit `.env` and fill at least:

```bash
TFY_WORKSPACE_FQN=cluster-id:workspace-name
TFY_SECRET_TENANT=your-tenant
HARNESS_DEPLOY_ROOT=/absolute/path/to/harness-deploy
```

Then choose a harness:

| Harness | Current support | Slack bot | Start here |
| --- | --- | --- | --- |
| Claude Code | Service + Volume gateway | Yes | `harnesses/claude-code/README.md` |
| Codex | Service + Volume gateway, Job fallback | Yes | `harnesses/codex/README.md` |
| Pi | Service + Volume gateway, Job fallback | Yes | `harnesses/pi/README.md` |
| Goose | Service + Volume server, Job fallback | Yes | `harnesses/goose/README.md` |
| Open SWE | Service + SecretGroup | Yes | `harnesses/openswe/README.md` |
| Hermes Agent | Service + Volume API server | Generic bridge | `harnesses/hermes-agent/README.md` |
| Cursor Agent SDK | Service worker candidate | No native target | `harnesses/cursor-agent-sdk/README.md` |
| DeepAgents | Job or custom Service wrapper | After wrapper | `harnesses/deepagents/README.md` |
| Open Agents | Service + external Postgres/cache | Bridge candidate | `harnesses/open-agents/README.md` |
| OpenClaw | Service + Volume candidate | Native/bridge TBD | `harnesses/openclaw/README.md` |

For harnesses with renderable deployment templates, the common deploy shape is:

```bash
make render-<harness>
make deploy-<harness>
```

Examples:

```bash
make deploy-codex
make deploy-claude-code
make deploy-pi
make deploy-goose
make deploy-openswe
```

If a harness README asks you to create secrets first, do that before the deploy
target.

Rendered files go to `.rendered/`. Do not commit `.env` or `.rendered/`.

## Slack Bot

Slack integrations use HTTP Events API through a TrueFoundry `Service`. Socket
Mode is not used.

For a Claude Code, Codex, Pi, Goose, or Open SWE bot:

```bash
cp harnesses/<harness>/deployments/template/.env.example \
  harnesses/<harness>/deployments/template/.env
```

Set `HARNESS_API_URL` in that harness-local `.env` to the public Slack bridge
URL, without a trailing slash.

Render and deploy the bridge:

```bash
make render-<harness>-slack
make deploy-<harness>-slack
```

Create the Slack app from the rendered manifest:

```bash
SLACK_APP_CONFIG_TOKEN=... make create-<harness>-slack-app
```

Open the printed OAuth URL, approve/install the app, then put
`SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in that harness's Slack
`SecretGroup`.

## Notes

- Use one Slack app per harness unless you intentionally want one bot identity
  routing multiple harnesses.
- Use `Service`, `Job`, `Volume`, and `SecretGroup` manifests directly; avoid
  application sets.
- Do not expose WebSocket-only surfaces from TrueFoundry deployments. Prefer
  HTTP, Server-Sent Events, polling, or webhooks.
- Treat these templates as deployment starting points. Validate secrets,
  authentication, sandboxing, and smoke tests before production use.
