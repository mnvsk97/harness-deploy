# Claude Code Compatibility Notes

## Direct Fit

- `claude -p` maps well to TrueFoundry `Job`.
- Secrets and provider routing map cleanly through `SecretGroup`.

## Needs Adaptation

- Claude Code is not an HTTP service by default.
- Interactive terminal features do not directly translate to a service deployment.
- Long-running service mode should be wrapped with explicit HTTP/SSE
  input/output handling around the Claude Agent SDK.
- Multi-session API deployments need filesystem isolation. The gateway uses
  per-session directories plus per-session Linux UID/GID execution instead of a
  shared process user.

## Risk

Claude Code can execute shell commands. Start with narrow prompts,
least-privilege secrets, a disposable workspace, and per-session execution
identity. The SDK bubblewrap sandbox may require pod privileges that are not
available in every TrueFoundry service security context.
