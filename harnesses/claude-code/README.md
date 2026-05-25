# Claude Code TrueFoundry Harness

Source repo: https://github.com/anthropics/claude-code

Research snapshot: `.research/repos/claude-code` at `39e853e`.

Claude Code is primarily a local coding agent. The deployed service path uses
the Claude Agent SDK behind an HTTP/SSE gateway so API clients such as Slack or
Telegram do not depend on terminal interactivity.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: headless and service caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: Anthropic secrets.
- `manifests/volume.yaml`: persistent Claude config/workspace.
- `manifests/job.yaml`: one-shot `claude -p` job.
- `manifests/worker-service.template.yaml`: wrapper service template.
