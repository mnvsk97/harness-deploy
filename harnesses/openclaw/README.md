# OpenClaw on TrueFoundry

Repo inspected: `https://github.com/openclaw/openclaw` at `f68ed721`.

OpenClaw is a long-running personal assistant gateway. It ships a production
Dockerfile and docker-compose setup. The gateway defaults to port `18789` and
has health endpoints at `/healthz` and `/readyz`.

Use this recipe as a `Service` with persistent state and workspace volumes.

