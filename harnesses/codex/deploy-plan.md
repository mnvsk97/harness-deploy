# Codex Deploy Plan

## Repo Findings

- Runtime: Rust/Node-distributed CLI.
- Non-interactive entrypoint: `codex exec`.
- MCP entrypoint: `codex mcp-server`, which is stdio-oriented.
- Configuration home: `CODEX_HOME`, usually under the user's home directory.
- Preferred auth mode: a TrueFoundry Gateway API key referenced as a secret and
  wired through Codex `config.toml`.
- Security controls: Codex has sandbox modes such as `read-only`, `workspace-write`, and `danger-full-access`.

## TrueFoundry Components

- `SecretGroup`: TrueFoundry Gateway API key and optional gateway/model config.
- `Job`: best production-like fit for a bounded coding task.
- `Volume`: optional persistence for `CODEX_HOME` and workspace cache.
- `MCPServer`: only after wrapping stdio as streamable HTTP or SSE.

## Recommended First Deploy

Use `manifests/job.yaml` with a harmless prompt. Keep `CODEX_SANDBOX=workspace-write` unless the task genuinely requires broader access.

## TrueFoundry Apply Order

1. Apply `manifests/secret-group.example.yaml`.
2. Apply `manifests/volume.yaml` if you want session/config persistence.
3. Apply `manifests/job.yaml`.
4. Only use `mcp-server.template.yaml` after adding an HTTP MCP bridge.
