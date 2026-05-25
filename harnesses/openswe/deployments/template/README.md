# Open SWE Service on TrueFoundry

This deployment exposes Open SWE's LangGraph/FastAPI service on port `2024`
without LangSmith-native runtime dependencies.

## Runtime Shape

- `openswe-service`: long-running HTTP service.
- `SANDBOX_TYPE=local`: commands run in the service container. This is useful
  for smoke testing the service and session API, not for untrusted coding work.
- `Dockerfile`: installs system dependencies and `uv`, then checks out the
  pinned Open SWE commit at container startup before launching
  `langgraph dev`.

The template intentionally keeps model, GitHub, Slack, Linear, and Daytona
secrets out of the manifest. Add those only when enabling real agent runs.

## Deploy

Render this template with:

```bash
OPENSWE_API_HOST=openswe-sai-ws.ml.tfy-eo.truefoundry.cloud make deploy-openswe
```

The manifest sets `local_build: false` so TrueFoundry builds remotely instead
of requiring Docker on the machine running the deploy.

Smoke test:

```bash
curl -i https://$OPENSWE_API_HOST/health
```

Expected response:

```json
{"status":"healthy"}
```
