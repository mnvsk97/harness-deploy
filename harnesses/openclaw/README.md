# OpenClaw

Source repo: https://github.com/openclaw/openclaw

Research snapshot: `.research/repos/openclaw` at `f68ed721`.

OpenClaw is a long-running personal assistant gateway with health endpoints and
file-backed state.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| OpenClaw gateway | `Service` | Main runtime on port `18789`. |
| `.openclaw` config, state, workspace | `Volume` | Required for durable assistant state. |
| Provider and channel tokens | `SecretGroup` | Stores model keys and trusted channel credentials. |
| MCP/tool exposure | Optional `MCPServer` later | Only after exposing a supported remote tool endpoint. |
| Docker-based sandboxing | External sandbox decision | Do not assume nested Docker inside TrueFoundry. |

## Start Here

- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
