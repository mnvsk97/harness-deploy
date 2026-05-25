# Goose Smoke Test

1. Run `make render-goose`.
2. Apply the Goose secret group and volume.
3. Run `make deploy-goose`.
4. Confirm the service reaches ready state.
5. Call `/status` on the service; it should return `ok` without a secret.
6. Call `/system_info` without `X-Secret-Key`; it should return `401`.
7. Call `/system_info` with the configured `X-Secret-Key`; it should return system info.
8. Start a session with `/agent/start`.
9. Resume the session with `/agent/resume`.
10. Send a prompt with `/sessions/{id}/reply` and stream events from `/sessions/{id}/events`.
11. Confirm logs do not print Gateway API keys or the Goose server secret.
