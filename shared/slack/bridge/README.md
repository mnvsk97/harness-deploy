# Harness Slack Bridge

Generic Slack HTTP Events bridge for harnesses that expose the standard
HTTP-ish session API:

- `POST /sessions` with `{ "message": "..." }`
- `POST /sessions/{session_id}/messages` for follow-up input
- `GET /sessions/{session_id}/events` returning `{ "events": [...] }`

Set path templates with env vars when a harness differs:

- `HARNESS_SESSION_CREATE_PATH`
- `HARNESS_SESSION_MESSAGE_PATH_TEMPLATE`
- `HARNESS_SESSION_EVENTS_PATH_TEMPLATE`

Expose `POST /slack/events` as the Slack Request URL. The bridge verifies Slack
request signatures using `SLACK_SIGNING_SECRET`, acknowledges Slack immediately,
then calls the target harness over HTTP in the background.

Required Slack env vars:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`

Do not use `SLACK_APP_TOKEN`; this bridge does not use Socket Mode.

For OpenAI-compatible chat targets, set `HARNESS_BODY_PROFILE=openai-chat`.
That mode skips session create/message/event endpoints, stores one bounded
message history per Slack thread and Slack user by default, and calls
`HARNESS_OPENAI_CHAT_PATH` directly.

Session scoping is controlled by `SLACK_SESSION_SCOPE`:

- `thread-user` (default): one conversation per Slack thread per Slack user
- `thread`: legacy shared thread behavior
- `user`: one conversation per Slack user per channel

In `openai-chat` mode, `HARNESS_OPENAI_SEND_SESSION_KEY=true` also sends the
stable Slack user key as the `X-Hermes-Session-Key` header so Hermes can scope
its own durable memory by Slack user. `HARNESS_OPENAI_SEND_USER=true` also
sends the same stable key as the OpenAI-compatible `user` field for services
that honor it.

`HARNESS_OPENAI_INJECT_SLACK_IDENTITY_GUARD=true` prepends a system message
that tells Hermes not to use global or cross-user personal memory for the
current Slack user.
