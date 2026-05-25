# DeepAgents Deploy Plan

## Repo Findings

- Runtime: Python package, built around `create_deep_agent` and LangGraph.
- Deployment example: `examples/deploy-coding-agent`.
- Upstream hosted deployment: `deepagents deploy`, with `deepagents.toml`.
- Example sandbox: LangSmith sandbox, not a local container sandbox.
- Common secrets: `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, optionally `OPENAI_API_KEY`.

## TrueFoundry Components

- `SecretGroup`: stores provider keys and LangSmith key if using LangSmith-backed sandboxing.
- `Job`: best first manifest for one-shot coding-agent or evaluation runs.
- `Service`: requires a small FastAPI/HTTP wrapper around the DeepAgents app.
- Optional `Volume`: only needed if the wrapper needs persistent workspace or memory outside LangGraph/LangSmith.

## Recommended First Deploy

Start with `manifests/job.yaml` to prove the package installs and the target workspace can reach provider APIs. For a production agent API, create a tiny app that imports the specific DeepAgents graph and exposes `/invoke`, `/stream`, and `/healthz`; then use `service-wrapper.template.yaml`.

## TrueFoundry Apply Order

1. Fill and apply `manifests/secret-group.example.yaml`.
2. Apply `manifests/job.yaml` for one-shot validation.
3. Build a wrapper repo or image, update `manifests/service-wrapper.template.yaml`, then apply it.
