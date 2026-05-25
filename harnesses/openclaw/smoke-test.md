# OpenClaw Smoke Test

1. Apply `secret-group.example.yaml`.
2. Apply `volume.yaml`.
3. Apply `service.yaml`.
4. Check app logs for gateway startup.
5. Call `/healthz`.
6. Call `/readyz`.
7. Send one message through a single configured channel or run a gateway SDK call.

