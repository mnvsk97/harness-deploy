# Smoke Test Template

1. Apply the manifest with dry-run and diff.
2. Apply the manifest for real.
3. Confirm application state reaches a terminal success state.
4. Inspect logs for startup errors.
5. For services with ports, call the health/status endpoint.
6. For jobs, trigger a simple prompt and inspect job logs/output.
7. Record exact failures in `compatibility.md`.

