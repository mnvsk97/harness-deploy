# Claude Code

Source repo: https://github.com/anthropics/claude-code

Research snapshot: `.research/repos/claude-code` at `39e853e`.

Claude Code is a local coding agent. In this repo, the deployable shape is an
HTTP/SSE gateway around the Claude Agent SDK so clients do not depend on a
terminal session.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| Claude Agent SDK session runtime | `Service` | Deployed as the main HTTP/SSE gateway. |
| `.claude` config and workspaces | `Volume` | Keeps session files and agent config durable. |
| Anthropic or gateway credentials | `SecretGroup` | Stores model/API credentials and gateway token. |
| `claude -p` bounded prompt mode | `Job` | Useful for one-shot tasks, not the primary Slack/API path. |
| Slack bot | `Service + SecretGroup + Volume` | Uses the shared HTTP Events bridge, not Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
