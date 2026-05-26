# Cursor Agent SDK

Source repo: https://github.com/cursor/cookbook

Research snapshot: `.research/repos/cursor-agent-sdk` at `4ea8442`.

The closest deployable upstream path is Cursor's self-hosted cloud-agent worker.
TrueFoundry hosts worker pods; Cursor remains the external control plane.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| Self-hosted cloud-agent worker | `Service` | Long-running outbound worker, usually no public ingress. |
| Cursor API key | `SecretGroup` | Stores service-account credential. |
| Worker cache/workspace | Optional `Volume` | Add only when worker jobs need persistence. |
| Management address | Optional `Service` port | Expose only when explicitly needed. |
| Slack bot | Not native | Use a separate bridge only after adding a target API. |

## Start Here

- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
