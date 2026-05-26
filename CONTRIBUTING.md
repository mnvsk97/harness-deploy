# Contributing

This repo is an experiment to test whether popular agent harnesses can be
mapped cleanly to TrueFoundry deployment components.

## What Good Contributions Include

- A short deploy plan that maps the harness to TrueFoundry components.
- A manifest or template that uses placeholders instead of tenant-specific
  values.
- Secret references via `tfy-secret://...`, never raw secret values.
- A smoke-test note that explains what was verified and what still needs work.
- A compatibility note that calls out missing platform primitives, external
  sandbox needs, and production risks.

## Local Checks

Before committing, run:

```bash
make clean-rendered render-codex render-claude-code render-hermes-agent render-pi render-goose
node --check harnesses/codex/gateway/server.js
node --check harnesses/claude-code/gateway/server.js
node --check harnesses/pi/gateway/server.js
python3 -m py_compile scripts/create_slack_app.py
```

Also scan committed files for raw secrets and environment-specific values. Keep
`.env`, `.rendered/`, and `.research/` out of commits.

## Manifest Rules

- Use one manifest per TrueFoundry component.
- Do not use application sets.
- Prefer HTTP, Server-Sent Events, polling, webhooks, jobs, or outbound workers
  over WebSocket-only surfaces.
- Keep production claims conservative unless the harness was deployed and
  smoke-tested end to end.
