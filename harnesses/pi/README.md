# Pi

Source repo: https://github.com/earendil-works/pi

Research snapshot: `.research/repos/pi` at `3eb0027`.

Pi is terminal-first, but the scalable TrueFoundry path uses the steppable
runtime behind an HTTP/SSE gateway.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| `pi --mode steppable-rpc` | `Service` | Wrapped by `gateway/` for durable HTTP/SSE sessions. |
| Pi sessions, snapshots, events, workspaces | `Volume` | Required for the current service gateway. |
| Provider and gateway credentials | `SecretGroup` | Stores model keys and gateway bearer token. |
| `pi -p` bounded prompt mode | `Job` | Useful for one-shot prompts and checks. |
| Slack bot | `Service + SecretGroup + Volume` | Uses the shared HTTP Events bridge, not Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
