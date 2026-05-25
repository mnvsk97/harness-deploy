# Claude Code TrueFoundry Harness

Source repo: https://github.com/anthropics/claude-code

Research snapshot: `.research/repos/claude-code` at `39e853e`.

Claude Code is primarily a terminal coding agent. The natural TrueFoundry target is a job using headless print mode. A service deployment needs an explicit wrapper around the CLI.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: headless and service caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: Anthropic secrets.
- `manifests/volume.yaml`: persistent Claude config/workspace.
- `manifests/job.yaml`: one-shot `claude -p` job.
- `manifests/worker-service.template.yaml`: wrapper service template.
