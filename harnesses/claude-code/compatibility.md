# Claude Code Compatibility Notes

## Direct Fit

- `claude -p` maps well to TrueFoundry `Job`.
- Secrets and provider routing map cleanly through `SecretGroup`.

## Needs Adaptation

- Claude Code is not an HTTP service by default.
- Interactive terminal features do not directly translate to a service deployment.
- Long-running worker mode should be wrapped with explicit queue/input/output handling.

## Risk

Claude Code can execute shell commands. Start with narrow prompts, least-privilege secrets, and a disposable workspace.
