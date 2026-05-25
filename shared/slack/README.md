# Slack Deployment Pattern

This repo standardizes on Slack Socket Mode for harness-to-Slack deployment.
That mirrors Hermes Agent's production path: a long-running worker connects
outbound to Slack using `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`, so TrueFoundry
does not need to expose a Slack Events webhook. This is not a TrueFoundry-hosted
WebSocket protocol surface; it is an outbound channel connector.

## Required Slack App Setup

Create a Slack app with:

- Socket Mode enabled.
- App-level token with `connections:write`; store as `SLACK_APP_TOKEN`.
- Bot token with at least `chat:write`, `app_mentions:read`, `channels:history`,
  `channels:read`, `groups:history`, `im:history`, `im:read`, `im:write`,
  `users:read`, and file scopes if attachments matter.
- Event subscriptions for `message.im`, `message.channels`, `message.groups`,
  and `app_mention`.
- App Home messages enabled for DMs.

## Native vs Bridge Mode

Native Slack harnesses can consume the shared env block directly:

- Hermes Agent
- OpenClaw, if its Slack channel is enabled in the installed build

Other harnesses need a wrapper/bridge:

- HTTP/session harnesses: deploy the shared Slack bridge that calls the harness
  API.
- CLI harnesses: deploy a Slack bridge that creates TrueFoundry job runs or calls
  a queue-backed worker wrapper.

## Hermes Native Slack

Hermes already ships a Slack adapter under `gateway/platforms/slack.py`. The
important behaviors to preserve are:

- Socket Mode with `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`.
- allowlists via `SLACK_ALLOWED_USERS` and `SLACK_ALLOWED_CHANNELS`.
- mention gating via `SLACK_REQUIRE_MENTION` and `SLACK_STRICT_MENTION`.
- Slack threads as the conversation boundary.

Render and deploy the Hermes-native Slack worker:

```bash
make deploy-hermes-agent-slack
```

## Shared Bridge

The bridge lives in `shared/slack/bridge`. It is for harnesses that expose the
standard HTTP session surface:

- `POST /sessions`
- `POST /sessions/{session_id}/messages`
- `GET /sessions/{session_id}/events`

Configure these `.env` values:

```bash
SLACK_BRIDGE_HARNESS_NAME=codex
SLACK_BRIDGE_HARNESS_API_URL=https://codex-http-gateway.example.truefoundry.cloud
SLACK_BRIDGE_TARGET_SECRET_GROUP=codex-gateway-secrets
SLACK_BRIDGE_TARGET_TOKEN_KEY=CODEX-GATEWAY-BEARER-TOKEN
SLACK_BRIDGE_SESSION_CREATE_PATH=/sessions
SLACK_BRIDGE_SESSION_MESSAGE_PATH_TEMPLATE=/sessions/{session_id}/messages
SLACK_BRIDGE_SESSION_EVENTS_PATH_TEMPLATE=/sessions/{session_id}/events
SLACK_BRIDGE_POLL_EVENTS=true
```

Deploy:

```bash
tfy apply -f shared/slack/secret-group.example.yaml
make deploy-slack-bridge
```

The bridge keeps an in-memory Slack-thread-to-harness-session map. For
production use, keep one replica unless the bridge is extended with shared
session storage.

Set `SLACK_BRIDGE_POLL_EVENTS=false` for harnesses that only expose Server-Sent
Events and do not have a JSON event-list endpoint yet. The message will still
create or continue the harness session, but Slack will only show the session
start/status messages until the harness gets a JSON polling endpoint or the
bridge is extended with SSE consumption.

## Legacy Env Injection

`scripts/slackify_manifest.py` is still useful for native Slack harnesses that
already know what to do with Hermes-style Slack env vars. It only injects env
vars; it does not create a Slack adapter for a harness that lacks one.
