# Codex TrueFoundry Harness

Source repo: https://github.com/openai/codex

Research snapshot: `.research/repos/codex` at `9f42c89`.

Codex is primarily a CLI coding agent. The clean TrueFoundry shape is a job that runs `codex exec` against a workspace. A service requires an extra wrapper because the CLI is not an HTTP server by default.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: CLI/server caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: OpenAI key.
- `manifests/volume.yaml`: persistent Codex home/workspace.
- `manifests/job.yaml`: one-shot `codex exec` job.
- `manifests/mcp-server.template.yaml`: stdio MCP wrapper note.
