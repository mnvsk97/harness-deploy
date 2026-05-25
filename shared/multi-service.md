# Multi-Service Harness Strategy

Harnesses should not be forced into a single TrueFoundry service. Use the
smallest deployable unit that matches the harness runtime.

## Default Rule

- One long-running gateway/API/worker -> one `service` manifest.
- One bounded CLI task -> one `job` manifest.
- Shared filesystem state -> one `volume` manifest, mounted only by the app that
  owns writes.
- Secrets -> one `secret-group` per harness, or `shared/slack/secret-group` for
  Slack-only credentials.

## Multi-Service Rule

Do not use application sets. They are being deprecated.

For multi-service harnesses, keep each component as a standalone manifest and
document apply order in the harness `deploy-plan.md`. If components should move
together, use naming, version tags, and CI ordering rather than a bundled
TrueFoundry resource.

## Current Harness Classification

| Harness | Multi-service handling |
| --- | --- |
| OpenClaw | Gateway service plus optional volume. Slack is native env config, not a second service unless bridged. |
| Hermes Agent | Gateway service, optional dashboard service, optional volume. Apply independently in order; do not bundle. |
| Cursor Agent SDK | Worker service; management endpoint template is an alternative variant, not a second required service. |
| Open Agents | Web service plus external Postgres/Redis. Slack requires a bridge service unless Open Agents grows native Slack routes. |
| Goose | CLI job and `goosed` service are separate modes. Do not deploy both by default. |
| Codex / Claude Code / Pi / DeepAgents | CLI/job or wrapper/service. Slack requires bridge/wrapper unless the user builds native Slack handling. |
