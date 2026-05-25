# DeepAgents Compatibility Notes

## Direct Fit

- One-shot jobs map cleanly to TrueFoundry `Job`.
- Custom HTTP APIs map cleanly to TrueFoundry `Service` once a wrapper exists.

## Needs Adaptation

- Upstream `deepagents deploy` targets LangSmith-hosted infrastructure, so it is not a replacement for `tfy apply`.
- The SDK itself is not a long-running server. TrueFoundry needs either a job command or an HTTP wrapper.
- Sandbox behavior depends on the chosen backend. If you use LangSmith sandboxes, TrueFoundry hosts the control wrapper and LangSmith hosts execution.

## Risk

DeepAgents is framework-level infrastructure. The manifest can standardize deployment, but the actual production surface must be chosen per agent: API service, background worker, scheduled job, or benchmark runner.
