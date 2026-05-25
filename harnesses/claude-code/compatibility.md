# Claude Code Compatibility Notes

## Direct Fit

- `claude -p` maps well to TrueFoundry `Job`.
- Secrets and provider routing map cleanly through `SecretGroup`.

## Needs Adaptation

- Claude Code is not an HTTP service by default.
- Interactive terminal features do not directly translate to a service deployment.
- Long-running service mode should be wrapped with explicit HTTP/SSE
  input/output handling around the Claude Agent SDK.

## Risk

Claude Code can execute shell commands. Start with narrow prompts, least-privilege secrets, and a disposable workspace.
