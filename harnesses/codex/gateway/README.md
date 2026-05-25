# Codex HTTP Gateway

Small HTTP/SSE wrapper around `codex app-server` for platforms that do not expose WebSockets.

## API

- `POST /sessions` creates a Codex thread. Body accepts `message`, `prompt`, or OpenAI/Codex `input`.
- `POST /sessions/{thread_id}/messages` starts a new turn in an existing thread.
- `GET /sessions/{thread_id}/events` streams Codex app-server notifications as SSE.
- `GET /sessions/{thread_id}?includeTurns=true` reads persisted thread state.
- `POST /sessions/{thread_id}/interrupt` interrupts an active turn.

Set `GATEWAY_BEARER_TOKEN` to require `Authorization: Bearer <token>` or `X-Codex-Gateway-Token`.
