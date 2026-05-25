# Slack Deployment Pattern

This repo standardizes on Slack Socket Mode for harness-to-Slack deployment.
That mirrors Hermes Agent's production path: the harness process connects
outbound to Slack using `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`, so TrueFoundry
does not need to expose a Slack Events webhook.

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

- HTTP harnesses: deploy a Slack bridge that calls the harness API.
- CLI harnesses: deploy a Slack bridge that creates TrueFoundry job runs or calls
  a queue-backed worker wrapper.

## Helper Script

```bash
python3 scripts/slackify_manifest.py \
  harnesses/hermes-agent/manifests/service.yaml \
  --out harnesses/hermes-agent/manifests/service.slack.yaml \
  --secret-tenant YOUR_USER_OR_TEAM \
  --secret-group slack-secrets
```

Then apply:

```bash
tfy apply -f shared/slack/secret-group.example.yaml
tfy apply -f harnesses/hermes-agent/manifests/service.slack.yaml --dry-run --show-diff
tfy apply -f harnesses/hermes-agent/manifests/service.slack.yaml
```
