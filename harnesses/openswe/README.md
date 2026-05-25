# Open SWE on TrueFoundry

Source repo: https://github.com/langchain-ai/open-swe

Open SWE is a LangGraph and Deep Agents based asynchronous coding-agent harness.
It exposes webhook surfaces for GitHub, Linear, and Slack, then runs coding tasks
inside isolated cloud sandboxes such as LangSmith, Modal, Daytona, or Runloop.

For TrueFoundry, treat Open SWE as a long-running HTTP service behind the
standard Harness Exposure Layer. Its native webhooks and LangGraph endpoints are
harness-native extension surfaces, not the repo-wide public contract.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: deployment caveats and protocol notes.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: required provider and integration secrets.
- `manifests/service-source-build.template.yaml`: source-build service template.
