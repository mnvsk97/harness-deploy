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
