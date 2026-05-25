# Harness Slack Bridge

Generic Slack Socket Mode bridge for harnesses that expose the standard
HTTP-ish session API:

- `POST /sessions` with `{ "message": "..." }`
- `POST /sessions/{session_id}/messages` for follow-up input
- `GET /sessions/{session_id}/events` returning `{ "events": [...] }`

Set path templates with env vars when a harness differs:

- `HARNESS_SESSION_CREATE_PATH`
- `HARNESS_SESSION_MESSAGE_PATH_TEMPLATE`
- `HARNESS_SESSION_EVENTS_PATH_TEMPLATE`

The bridge does not expose Slack Events over an inbound webhook. It runs as a
long-lived outbound worker using Slack Socket Mode, then calls the target
harness over HTTP.
