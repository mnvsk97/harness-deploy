# Codex Smoke Test

1. Apply the secret group.
2. Run the job with `CODEX_PROMPT="Say exactly: codex-ok"`.
3. Confirm the job installs Codex and exits successfully.
4. Confirm logs do not print API keys.
5. If workspace persistence is enabled, run a second job and confirm `CODEX_HOME` still exists.
