# Hermes Agent Smoke Test

1. Apply secrets and volume.
2. Apply `service.yaml`.
3. Inspect logs for config bootstrap and gateway startup.
4. If API server is enabled, call the authenticated health/API endpoint.
5. If dashboard is enabled, open the exposed dashboard endpoint behind auth.
6. Send one low-risk prompt through CLI/API/channel.

