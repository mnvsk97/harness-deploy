# harness-deploy

Deploy agent harnesses on TrueFoundry, create Slack bots for them, and start
using those bots from your workspace.

This repo is intentionally boring to operate:

- TrueFoundry runs the services, jobs, volumes, and secret references.
- Slack talks to the services through HTTP Events API.
- Secrets live in TrueFoundry SecretGroups or your local `.env`, never in Git.
- Sandboxes are external runtimes such as Daytona. TrueFoundry is the deploy
  and control-plane substrate, not the sandbox provider.
- WebSockets and Slack Socket Mode are not part of this setup. Use HTTP,
  polling, Server-Sent Events, webhooks, or worker callbacks.

## What You Can Deploy

| Harness | Main service | Slack bot | Main deploy target |
| --- | --- | --- | --- |
| Codex | Service + Volume gateway | Yes | `make deploy-codex` |
| Claude Code | Service + Volume gateway | Yes | `make deploy-claude-code` |
| Pi | Service + Volume gateway | Yes | `make deploy-pi` |
| Goose | Service + Volume server | Yes | `make deploy-goose` |
| Open SWE | Service + SecretGroup | Yes | `make deploy-openswe` |
| Hermes Agent | Service + Volume API server | Via generic bridge | `make deploy-hermes-agent` |
| Cursor Agent SDK | Service worker candidate | Not wired yet | Read `harnesses/cursor-agent-sdk/README.md` |
| DeepAgents | Job or custom service wrapper | After wrapper | Read `harnesses/deepagents/README.md` |
| Open Agents | Service + external Postgres/cache | Bridge candidate | Read `harnesses/open-agents/README.md` |
| OpenClaw | Service + Volume candidate | Native or bridge TBD | Read `harnesses/openclaw/README.md` |

If you want the fastest successful path, start with Codex, Claude Code, Pi,
Goose, Open SWE, or Hermes Agent.

## The Whole Flow

These are the steps from a clean clone to a usable Slack bot:

1. Install the local tools.
2. Clone the repo.
3. Create your local `.env`.
4. Connect the repo to your TrueFoundry workspace.
5. Create or point to the required TrueFoundry SecretGroups.
6. Pick a harness.
7. Render the TrueFoundry YAML.
8. Deploy the harness service.
9. Create the Slack app manifest.
10. Create or install the Slack app.
11. Store the Slack bot token and signing secret in TrueFoundry.
12. Deploy the Slack bridge service.
13. Invite the bot to Slack and send it a message.
14. Smoke test the service and debug from TrueFoundry logs if needed.

The sections below spell out each step.

## 1. Install Local Tools

You need:

- TrueFoundry CLI, authenticated to the workspace you will deploy into.
- `envsubst`, used to render templates.
- `python3`, used by the Slack app creation helper.
- Node.js and npm, only if you want to use the local UI.

On macOS:

```bash
brew install gettext python3 node
```

Make sure `envsubst` is visible:

```bash
envsubst --version
```

Make sure TrueFoundry is visible:

```bash
tfy --help
```

If your shell cannot find `envsubst`, add Homebrew's gettext path to your
shell profile or call it from `/opt/homebrew/opt/gettext/bin/envsubst`.

## 2. Clone The Repo

```bash
git clone git@github.com:mnvsk97/harness-deploy.git
cd harness-deploy
```

Check that you are on `main`:

```bash
git status --short --branch
```

## 3. Create Your Local `.env`

Copy the example:

```bash
cp .env.example .env
```

Do not commit `.env`. It is ignored on purpose.

Open `.env` and fill the shared values first:

```bash
TFY_WORKSPACE_FQN=cluster-id:workspace-name
TFY_SECRET_TENANT=your-tenant-or-user
HARNESS_DEPLOY_ROOT=/absolute/path/to/harness-deploy
```

What those mean:

| Value | Meaning |
| --- | --- |
| `TFY_WORKSPACE_FQN` | The TrueFoundry workspace where services, jobs, and volumes will be deployed. |
| `TFY_SECRET_TENANT` | The tenant/user namespace that owns your TrueFoundry SecretGroups. |
| `HARNESS_DEPLOY_ROOT` | Absolute local path to this repo. Some deployed services use it in generated manifests. |

Then fill only the values for the harness you are deploying. You do not need to
complete every variable in `.env` before your first deploy.

## 4. Connect To A TrueFoundry Workspace

Authenticate the TrueFoundry CLI using your org's normal login flow. Then
confirm you can reach the target workspace:

```bash
tfy --help
```

If your CLI has a workspace or whoami command available, use it to confirm the
same workspace you put in `TFY_WORKSPACE_FQN`.

Before deploying, decide the public hostnames for your harness service and
Slack bridge. Examples:

```bash
CODEX_GATEWAY_HOST=codex-http-gateway.example.truefoundry.cloud
CODEX_SLACK_HOST=codex-slack.example.truefoundry.cloud
```

The exact hostnames come from your TrueFoundry ingress/domain setup.

## 5. Put Secrets In SecretGroups

Never paste raw keys into YAML files, README files, or committed source.

Use TrueFoundry SecretGroups for real values such as:

- LLM gateway base URL and API key.
- Harness gateway bearer token.
- Daytona API key.
- Slack bot token.
- Slack signing secret.

Templates reference secrets like this:

```text
tfy-secret://${TFY_SECRET_TENANT}:codex-gateway-secrets:CODEX-GATEWAY-BEARER-TOKEN
```

That string is safe to commit because it is a pointer, not the secret value.

Common SecretGroups:

| SecretGroup | Typical keys |
| --- | --- |
| `codex-tfy-gateway-secrets` | `TFY-GATEWAY-BASE-URL`, `TFY-GATEWAY-API-KEY` |
| `codex-gateway-secrets` | `CODEX-GATEWAY-BEARER-TOKEN`, sometimes `OPENAI-API-KEY` |
| `claude-code-gateway-secrets` | `CLAUDE-GATEWAY-BEARER-TOKEN` |
| `pi-daytona-secrets` | `DAYTONA-API-KEY` |
| `goose-api-secrets` | `GOOSE-SERVER-SECRET-KEY`, `DAYTONA-API-KEY` |
| `openswe-secrets` | `DAYTONA-API-KEY` |
| `<harness>-slack-gateway-secrets` | `SLACK-BOT-TOKEN`, `SLACK-SIGNING-SECRET` |

If your existing SecretGroup uses underscore names instead of dash names,
update the matching template or create the dash-named keys expected by the
current deployment templates.

## 6. Choose A Harness

Pick one target and fill the matching `.env` values.

### Codex

```bash
CODEX_GATEWAY_HOST=codex-http-gateway.example.truefoundry.cloud
CODEX_GATEWAY_SECRET_GROUP=codex-gateway-secrets
TFY_GATEWAY_SECRET_GROUP=codex-tfy-gateway-secrets
```

Deploy:

```bash
make deploy-codex
```

### Claude Code

```bash
CLAUDE_CODE_GATEWAY_HOST=claude-code-gateway.example.truefoundry.cloud
CLAUDE_CODE_GATEWAY_URL=https://claude-code-gateway.example.truefoundry.cloud
CLAUDE_CODE_GATEWAY_SECRET_GROUP=claude-code-gateway-secrets
TFY_GATEWAY_SECRET_GROUP=codex-tfy-gateway-secrets
```

Deploy:

```bash
make deploy-claude-code
```

### Pi

```bash
PI_GATEWAY_HOST=pi-steppable-gateway.example.truefoundry.cloud
PI_MODEL=openai-main/gpt-5.5
PI_DAYTONA_SECRET_GROUP=pi-daytona-secrets
PI_DAYTONA_IMAGE=node:22-bookworm
```

Deploy:

```bash
make deploy-pi
```

### Goose

```bash
GOOSE_API_HOST=goose-api.example.truefoundry.cloud
GOOSE_MODEL=openai-main/gpt-5.5
GOOSE_SECRET_GROUP=goose-api-secrets
GOOSE_SECRET_INTEGRATION_FQN=tenant:provider:cluster:secret-store:name
GOOSE_SECRET_ADMIN_EMAIL=admin@example.com
```

Deploy:

```bash
make deploy-goose
```

### Open SWE

Open SWE needs a Daytona key before the first deploy:

```bash
OPENSWE_API_HOST=openswe.example.truefoundry.cloud
OPENSWE_SECRET_GROUP=openswe-secrets
OPENSWE_SECRET_INTEGRATION_FQN=tenant:provider:cluster:secret-store:name
OPENSWE_SECRET_ADMIN_SUBJECT=user:admin@example.com
DAYTONA_API_KEY=put-this-only-in-local-env-or-secret-manager
```

Create/update the Open SWE SecretGroup:

```bash
make deploy-openswe-secrets
```

Deploy:

```bash
make deploy-openswe
```

### Hermes Agent

```bash
HERMES_API_HOST=hermes-api.example.truefoundry.cloud
HERMES_VOLUME_NAME=hermes-state-block
TFY_GATEWAY_SECRET_GROUP=codex-tfy-gateway-secrets
CODEX_GATEWAY_SECRET_GROUP=codex-gateway-secrets
```

Deploy:

```bash
make deploy-hermes-agent
```

Hermes exposes an OpenAI-compatible API. The Slack bridge uses the
`openai-chat` profile for Hermes instead of the generic session endpoints.

## 7. Render Before You Deploy

Every deploy target renders files into `.rendered/` first. You can inspect the
YAML before deploying:

```bash
make render-codex
ls .rendered/codex
```

Then deploy:

```bash
make deploy-codex
```

`.rendered/` is ignored and should not be committed.

## 8. Create A Slack Bot

Slack setup has two parts:

1. The Slack app itself.
2. The TrueFoundry Slack bridge service that receives Slack HTTP Events.

Socket Mode is intentionally not used. Do not configure `SLACK_APP_TOKEN`.

### Get A Slack App Configuration Token

Create a Slack app configuration token that can call Slack's App Manifest API.
Put it only in your local shell or local `.env`:

```bash
SLACK_APP_CONFIG_TOKEN=xapp-...
```

For org-level tokens, also set:

```bash
SLACK_TEAM_ID=T0123456789
```

Do not commit either value.

### Pick The Bot Name And Host

For each harness, set a Slack host and app name:

```bash
CODEX_SLACK_HOST=codex-slack.example.truefoundry.cloud
CODEX_SLACK_SECRET_GROUP=codex-slack-gateway-secrets
CODEX_SLACK_APP_NAME=Codex
```

Use one Slack app per harness unless you deliberately want one bot identity to
route to multiple harnesses.

### Render The Slack App Manifest

Use the harness-specific render target:

```bash
make render-codex-slack
```

This writes:

```text
.rendered/codex/slack-app-manifest.json
.rendered/codex/slack-service.yaml
.rendered/codex/slack-volume.yaml
```

Open the manifest and confirm it points to:

```text
https://<your-slack-bridge-host>/slack/events
```

### Create The Slack App

Use the harness-specific create target:

```bash
SLACK_APP_CONFIG_TOKEN=xapp-... make create-codex-slack-app
```

The command prints:

```text
app_id=...
signing_secret=...
oauth_authorize_url=...
```

It also writes the full Slack response to:

```text
.rendered/codex/slack-app-create-response.json
```

Open the `oauth_authorize_url`, approve the app, and install it into your
Slack workspace.

### Store Slack Secrets

After install, put these values in the harness Slack SecretGroup:

```text
SLACK-BOT-TOKEN=<bot token from Slack install>
SLACK-SIGNING-SECRET=<signing secret from Slack app creation>
```

Example SecretGroup name:

```bash
CODEX_SLACK_SECRET_GROUP=codex-slack-gateway-secrets
```

The deploy template reads those secrets through `tfy-secret://` references.

### Deploy The Slack Bridge

For Codex:

```bash
make deploy-codex-slack
```

For other harnesses:

```bash
make deploy-claude-code-slack
make deploy-pi-slack
make deploy-goose-slack
make deploy-openswe-slack
```

There is no Socket Mode worker. Slack sends HTTP Events directly to the public
bridge URL.

## 9. Hermes Slack Bridge

Hermes uses an OpenAI-compatible chat endpoint instead of the generic
`/sessions` endpoints.

Set these values:

```bash
SLACK_BRIDGE_HARNESS_NAME=hermes
SLACK_BRIDGE_HOST=hermes-slack.example.truefoundry.cloud
SLACK_SECRET_GROUP=hermes-slack-gateway-secrets
SLACK_BRIDGE_HARNESS_API_URL=https://hermes-api.example.truefoundry.cloud
SLACK_BRIDGE_TARGET_SECRET_GROUP=codex-gateway-secrets
SLACK_BRIDGE_TARGET_TOKEN_KEY=CODEX-GATEWAY-BEARER-TOKEN
SLACK_BRIDGE_BODY_PROFILE=openai-chat
SLACK_BRIDGE_OPENAI_CHAT_PATH=/v1/chat/completions
SLACK_BRIDGE_OPENAI_MAX_HISTORY_MESSAGES=20
SLACK_BRIDGE_OPENAI_TEMPERATURE=0
SLACK_BRIDGE_OPENAI_SEND_USER=true
SLACK_BRIDGE_OPENAI_SEND_SESSION_KEY=true
SLACK_BRIDGE_OPENAI_INJECT_SLACK_IDENTITY_GUARD=true
SLACK_SESSION_SCOPE=thread-user
SLACK_BRIDGE_POLL_EVENTS=false
```

Render the generic bridge:

```bash
make render-slack-bridge
```

Create the Slack app:

```bash
SLACK_APP_CONFIG_TOKEN=xapp-... make create-slack-app
```

Install from the printed OAuth URL, store `SLACK-BOT-TOKEN` and
`SLACK-SIGNING-SECRET` in the configured Slack SecretGroup, then deploy:

```bash
make deploy-slack-bridge
```

## 10. Use The Bot

In Slack:

1. Invite the app to a channel.
2. Mention it in a message, for example `@Codex hello`.
3. Keep the conversation in the same thread.
4. Watch for the bot's threaded reply.

The bridge reacts while work is running, then edits one threaded reply as the
harness returns output.

For direct API smoke tests, use each harness README or smoke test file:

| Harness | Smoke docs |
| --- | --- |
| Codex | `harnesses/codex/smoke-test.md` |
| Claude Code | `harnesses/claude-code/smoke-test.md` |
| Pi | `harnesses/pi/smoke-test.md` |
| Goose | `harnesses/goose/smoke-test.md` |
| Open SWE | `harnesses/openswe/smoke-test.md` |
| Hermes Agent | `harnesses/hermes-agent/smoke-test.md` |

Hermes also has a helper:

```bash
HERMES_API_TOKEN=<gateway-token> make smoke-hermes-agent
```

## 11. Optional Local UI

The local UI helps you configure a Slack agent, create the Slack app, view the
OAuth link, and submit deploy targets.

It is local-only. It stores local state in `ui/data/harness-deploy.sqlite`,
which is ignored by Git.

Install dependencies:

```bash
cd ui
npm install
```

Start the API server from the `ui` folder:

```bash
npm run server
```

In another terminal:

```bash
cd ui
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The UI reads workspace and secret configuration from the repo root `.env`.
Before using the UI, make sure `.env` has:

```bash
TFY_WORKSPACE_FQN=...
TFY_SECRET_TENANT=...
SLACK_APP_CONFIG_TOKEN=...
```

The UI flow is:

1. Pick a harness.
2. Pick a model.
3. Select MCP servers and agent skills.
4. Optionally enable Daytona if `DAYTONA_API_KEY` is present.
5. Create the local agent record.
6. Open the agent details.
7. Click `Create Slack bot`.
8. Open the OAuth URL and install the Slack app.
9. Put Slack secrets into the harness Slack SecretGroup.
10. Click `Deploy to TrueFoundry`.
11. Invite the bot to Slack and use it.

## 12. Command Cheat Sheet

### Main Harness Deploys

```bash
make deploy-codex
make deploy-claude-code
make deploy-pi
make deploy-goose
make deploy-openswe-secrets
make deploy-openswe
make deploy-hermes-agent
```

### Slack App Creation

```bash
SLACK_APP_CONFIG_TOKEN=xapp-... make create-codex-slack-app
SLACK_APP_CONFIG_TOKEN=xapp-... make create-claude-code-slack-app
SLACK_APP_CONFIG_TOKEN=xapp-... make create-pi-slack-app
SLACK_APP_CONFIG_TOKEN=xapp-... make create-goose-slack-app
SLACK_APP_CONFIG_TOKEN=xapp-... make create-openswe-slack-app
SLACK_APP_CONFIG_TOKEN=xapp-... make create-slack-app
```

### Slack Bridge Deploys

```bash
make deploy-codex-slack
make deploy-claude-code-slack
make deploy-pi-slack
make deploy-goose-slack
make deploy-openswe-slack
make deploy-slack-bridge
```

### Cleanup Rendered Files

```bash
make clean-rendered
```

## 13. What Not To Commit

These are intentionally ignored:

- `.env`
- `.rendered/`
- `.research/`
- `tmp/`
- `node_modules/`
- `ui/node_modules/`
- `ui/dist/`
- `ui/data/`
- `.superdesign`
- `.DS_Store`
- `*.log`

Before committing, run:

```bash
git status --short --ignored
```

Make sure no raw secret files, databases, screenshots, local build output, or
runtime directories are staged.

## 14. Troubleshooting

### `envsubst not found`

Install gettext:

```bash
brew install gettext
```

Then make sure your shell can find `envsubst`.

### `tfy not found`

Install and authenticate the TrueFoundry CLI, then rerun the deploy target.

### Slack says the request URL is invalid

Check that the Slack bridge service is deployed and public:

```text
https://<slack-bridge-host>/slack/events
```

The URL must be HTTPS and reachable by Slack.

### Bot does not respond

Check these in order:

1. The bot is invited to the channel.
2. The Slack app has the required bot scopes.
3. `SLACK-BOT-TOKEN` and `SLACK-SIGNING-SECRET` are in the right SecretGroup.
4. The bridge service is healthy in TrueFoundry.
5. The target harness service is healthy.
6. The target harness bearer token key matches `SLACK_BRIDGE_TARGET_TOKEN_KEY`.
7. The bridge target URL points to the harness API URL, not the Slack bridge URL.

### Open SWE deploy fails before starting

Check that `DAYTONA_API_KEY` is present locally for rendering the SecretGroup
and present in the deployed `openswe-secrets` SecretGroup.

### Hermes remembers the wrong person in Slack

Use the `openai-chat` profile with:

```bash
SLACK_SESSION_SCOPE=thread-user
SLACK_BRIDGE_OPENAI_SEND_SESSION_KEY=true
SLACK_BRIDGE_OPENAI_INJECT_SLACK_IDENTITY_GUARD=true
```

That scopes Hermes memory by Slack user key.

## 15. Repo Rules

- Keep public docs free of raw secrets.
- Keep deploys TrueFoundry-native: `Service`, `Job`, `Volume`,
  `SecretGroup`, and `MCPServer` when appropriate.
- Do not introduce WebSocket-only or Slack Socket Mode paths.
- Prefer one Slack app per harness.
- Inspect `.rendered/` before deploying if you are changing templates.
- Validate with smoke tests before treating a deployment as production-ready.
