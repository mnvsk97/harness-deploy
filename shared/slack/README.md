# Slack HTTP Events Deployment Pattern

This repo uses Slack HTTP Events API for harness-to-Slack deployment. Socket
Mode is always off for this project; do not configure `SLACK_APP_TOKEN`.

## TrueFoundry Components

- `Service`: runs the Slack HTTP bridge and exposes `POST /slack/events`.
- `SecretGroup`: stores Slack credentials, allowlists, and the target harness
  API token.
- `Volume`: not used by the generic bridge template.

## Required Slack App Setup

Use a separate Slack app per harness unless you intentionally want one bot
identity to route across multiple harnesses. Claude Code Test is the Claude
Code app; do not reuse its bot token for Codex, Pi, Goose, or Open SWE.

Create or update a harness-specific Slack app from the rendered manifest:

```bash
make render-slack-bridge
```

Then paste `.rendered/slack/slack-app-manifest.json` into Slack's app manifest
editor. The manifest sets Socket Mode off and points Events API traffic to:

```text
https://${SLACK_BRIDGE_HOST}/slack/events
```

The Slack app needs these bot scopes:

- `chat:write`
- `app_mentions:read`
- `channels:history`
- `channels:read`
- `groups:history`
- `im:history`
- `im:read`
- `im:write`
- `reactions:write`
- `users:read`

## Operator Flow

1. Deploy the target harness gateway, for example `make deploy-codex`.
2. Set `.env` values including `SLACK_BRIDGE_HOST` and
   `SLACK_BRIDGE_HARNESS_API_URL`.
3. Run `make render-slack-bridge`.
4. Create or update the Slack app from
   `.rendered/slack/slack-app-manifest.json`.
5. Put `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in the Slack
   `SecretGroup`; put the target harness token in the configured target
   `SecretGroup`.
6. Run `make deploy-slack-bridge`.

For per-harness bot identities, use the harness-specific editable manifests:

- `harnesses/codex/deployments/template/slack-app-manifest.editable.json`
- `harnesses/claude-code/deployments/template/slack-app-manifest.editable.json`
- `harnesses/pi/deployments/template/slack-app-manifest.editable.json`
- `harnesses/goose/deployments/template/slack-app-manifest.editable.json`
- `harnesses/openswe/deployments/template/slack-app-manifest.editable.json`

Each editable manifest uses `${HARNESS_API_URL}` for the Slack Events request
URL. Copy the matching harness-local `.env.example` to `.env`, set
`HARNESS_API_URL` to that harness's public Slack bridge URL, then replace the
placeholder before pasting into Slack.

Or render from `.env` with the harness-specific targets:

```bash
make render-codex-slack
make render-claude-code-slack
make render-pi-slack
make render-goose-slack
make render-openswe-slack
```

Each render target reads `HARNESS_API_URL` from that harness folder's `.env`
when present and writes a concrete request URL to `.rendered/<harness>/slack-app-manifest.json`.
Each Slack app manifest should be installed as its own Slack app/bot.

To create the Slack app through Slack's App Manifest API, generate a Slack app
configuration token, set it as `SLACK_APP_CONFIG_TOKEN` in the root `.env` or
the shell, and run the matching create target:

```bash
make create-codex-slack-app
make create-claude-code-slack-app
make create-pi-slack-app
make create-goose-slack-app
make create-openswe-slack-app
```

For org-level tokens, also set `SLACK_TEAM_ID`. The create target writes the
full Slack response to `.rendered/<harness>/slack-app-create-response.json` and
prints the `app_id`, `signing_secret`, and `oauth_authorize_url`.

Slack still requires installing/approving the created app from the returned
OAuth URL. After install, copy the bot token and signing secret into that
harness's Slack `SecretGroup`, then deploy the bridge.

## Bridge Configuration

The bridge lives in `shared/slack/bridge`. By default it is for harnesses that
expose an HTTP session surface:

- `POST /sessions`
- `POST /sessions/{session_id}/messages`
- `GET /sessions/{session_id}/events`

Configure these `.env` values:

```bash
SLACK_BRIDGE_HOST=codex-slack.example.truefoundry.cloud
SLACK_BRIDGE_SERVICE_NAME=harness-slack-bridge
SLACK_BRIDGE_HARNESS_NAME=codex
SLACK_BRIDGE_HARNESS_API_URL=https://codex-http-gateway.example.truefoundry.cloud
SLACK_BRIDGE_TARGET_SECRET_GROUP=codex-gateway-secrets
SLACK_BRIDGE_TARGET_TOKEN_KEY=CODEX-GATEWAY-BEARER-TOKEN
SLACK_BRIDGE_SESSION_CREATE_PATH=/sessions
SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE=/sessions/{session_id}/messages
SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE=/sessions/{session_id}/events
SLACK_BRIDGE_POLL_EVENTS=true
SLACK_BRIDGE_IGNORE_EVENT_TIMEOUTS=false
SLACK_UPDATE_THROTTLE_MS=1500
SLACK_REACTION_RUNNING=eyes
SLACK_REACTION_SUCCESS=white_check_mark
SLACK_REACTION_FAILURE=x
SLACK_PROCESSED_EVENT_TTL_MS=86400000
SLACK_PROCESSED_EVENT_LIMIT=5000
```

Set `SLACK_BRIDGE_POLL_EVENTS=false` for harnesses that do not expose a JSON
event-list endpoint yet.

For Hermes or another OpenAI-compatible chat service, set:

```bash
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

The `openai-chat` profile maps each Slack thread plus Slack user to one
persisted conversation history and calls the chat-completions endpoint
directly. It also sends the stable Slack user key as `X-Hermes-Session-Key`
by default, so Hermes can scope durable memory by Slack user. It also sends
the same key as the OpenAI-compatible `user` field for services that honor it.
The identity guard adds a system message telling Hermes not to use global or
cross-user personal memories for the current Slack user.
It does not send a model by default, so the target service keeps control of
the default model.

For accepted Slack events, the bridge maps one Slack thread to one harness
session, reacts to the user message while the run is active, and edits one
threaded bot reply with `chat.update` as harness events are polled.
