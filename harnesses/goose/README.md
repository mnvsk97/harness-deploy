# Goose

Source repo: https://github.com/aaif-goose/goose

Research snapshot: `.research/repos/goose` at `ce004f7`.

Goose ships a CLI and a `goosed` server. The upstream Dockerfile currently
targets the CLI, so this repo includes a dedicated server image path for
`goosed agent`.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| `goosed agent` | `Service` | Main deployed server path. |
| Goose config, sessions, workspaces | `Volume` | Persists server state and workspace files. |
| Provider keys and Goose server secret | `SecretGroup` | Stores model and `GOOSE_SERVER__SECRET_KEY` values. |
| `goose` CLI | `Job` | Useful for one-shot validation. |
| `goosed mcp ...` | `MCPServer` only after remote transport | Register only after exposing HTTP/SSE/streamable MCP. |
| Slack bot | `Service + SecretGroup + Volume` | Uses the shared HTTP Events bridge, not Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
