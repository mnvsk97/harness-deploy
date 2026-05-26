# Codex

Source repo: https://github.com/openai/codex

Research snapshot: `.research/repos/codex` at `9f42c89`.

Codex is primarily a CLI coding agent. This repo supports both the bounded
`codex exec` shape and a deployed HTTP/SSE gateway for session-based use.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| HTTP/SSE app-server gateway | `Service` | Primary deployed path for API and Slack sessions. |
| `CODEX_HOME` and workspaces | `Volume` | Persists config, sessions, and workspace state. |
| TrueFoundry Gateway token/model config | `SecretGroup` | Routes model calls through TrueFoundry Gateway. |
| `codex exec` | `Job` | Fits finite one-shot coding tasks. |
| `codex mcp-server` stdio server | `MCPServer` only after bridge | Needs HTTP/SSE/streamable transport before registration. |
| Slack bot | `Service + SecretGroup + Volume` | Uses the shared HTTP Events bridge, not Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
