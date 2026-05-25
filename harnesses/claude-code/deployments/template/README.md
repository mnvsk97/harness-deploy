# Claude Code Deploy

Copy the root env example and set environment-specific values:

```bash
cp .env.example .env
```

This deployment exposes an HTTP/SSE gateway around the Claude Agent SDK. It
does not use a pseudo-terminal or `claude -p` for the live session path.

Render and deploy:

```bash
make deploy-claude-code
```

Slack bridge:

- `slack-service.yaml` exposes `POST /slack/events` for Slack HTTP Events API.
- `slack-volume.yaml` persists Slack thread-to-Claude-session mappings.
- Socket Mode is intentionally not used; do not configure `SLACK_APP_TOKEN`.

Deploy it with:

```bash
make deploy-claude-code-slack
```

Endpoint:

```text
https://${CLAUDE_CODE_GATEWAY_HOST}
```

API:

```bash
curl -X POST https://$CLAUDE_CODE_GATEWAY_HOST/v1/agents/claude-code/sessions \
  -H "authorization: Bearer $CLAUDE_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Say exactly: claude-ok"}'
```

```bash
curl -X POST https://$CLAUDE_CODE_GATEWAY_HOST/v1/sessions/$SESSION_ID/events \
  -H "authorization: Bearer $CLAUDE_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Continue"}'
```

```bash
curl -N https://$CLAUDE_CODE_GATEWAY_HOST/v1/sessions/$SESSION_ID/stream \
  -H "authorization: Bearer $CLAUDE_GATEWAY_TOKEN"
```

Notes:

- `GATEWAY_BEARER_TOKEN` uses the Claude Code gateway bearer-token secret.
- Model access is routed through the same TrueFoundry Gateway secret group used
  by the Codex deployment. The default model is
  `testmodel/global.anthropic.claude-sonnet-4-6`.
- The service uses a block volume and single replica because SDK session
  transcripts, workspaces, and Claude config are stateful.
- Each gateway session gets a separate workspace, home directory, Claude config
  directory, temp directory, and Linux UID/GID. This keeps file access isolated
  between concurrent Slack/API sessions while staying within the normal
  TrueFoundry service deployment shape.
- `CLAUDE_GATEWAY_SANDBOX_MODE=unix-user` is used because the stricter
  bubblewrap namespace sandbox requires pod privileges that are not available in
  the current TrueFoundry service security context.
