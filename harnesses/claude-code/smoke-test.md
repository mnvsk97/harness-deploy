# Claude Code Smoke Test

1. Apply the secret group.
2. Run the job with `CLAUDE_PROMPT="Say exactly: claude-ok"`.
3. Confirm the CLI installs and exits successfully.
4. Confirm logs do not print API keys or auth tokens.
5. If using a custom Anthropic base URL, confirm the request reaches that gateway.
