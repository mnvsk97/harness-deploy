# DeepAgents TrueFoundry Harness

Source repo: https://github.com/langchain-ai/deepagents

Research snapshot: `.research/repos/deepagents` at `0bd35b2`.

DeepAgents is a Python SDK for building durable LangGraph-based agents. The upstream repo has a `deepagents deploy` path for LangSmith-hosted agents, but the TrueFoundry shape is different: package the agent code as either an HTTP service wrapper or a finite job.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: what works directly and what needs a wrapper.
- `smoke-test.md`: checks after apply.
- `manifests/secret-group.example.yaml`: provider and LangSmith secrets.
- `manifests/job.yaml`: one-shot coding agent job template.
- `manifests/service-wrapper.template.yaml`: HTTP wrapper service template for custom DeepAgents apps.
