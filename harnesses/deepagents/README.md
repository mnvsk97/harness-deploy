# DeepAgents

Source repo: https://github.com/langchain-ai/deepagents

Research snapshot: `.research/repos/deepagents` at `0bd35b2`.

DeepAgents is a Python SDK for building durable LangGraph agents. TrueFoundry
does not deploy the SDK by itself; it deploys a job or a small HTTP wrapper that
imports a specific DeepAgents app.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| One-shot DeepAgents run | `Job` | Best first validation path. |
| Custom DeepAgents API wrapper | `Service` | Needed for production HTTP APIs. |
| Provider and LangSmith credentials | `SecretGroup` | Stores model and tracing/sandbox keys. |
| Workspace or memory files | Optional `Volume` | Only needed if the wrapper persists local state. |
| Slack bot | Not native | Use shared Slack bridge after adding a target HTTP API. |

## Start Here

- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
