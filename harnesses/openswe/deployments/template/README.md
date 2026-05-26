# Open SWE Service on TrueFoundry

This deployment exposes Open SWE's LangGraph/FastAPI service on port `2024`.

## Runtime Shape

- `openswe-service`: long-running HTTP service.
- `SANDBOX_TYPE=daytona`: commands run in a Daytona sandbox.
- `Dockerfile`: installs system dependencies and `uv`, then checks out the
  pinned Open SWE commit at container startup before launching
  `langgraph dev`.

Model calls use the same TrueFoundry Gateway secret group as the Claude Code
integration via `OPENAI_BASE_URL` and `OPENAI_API_KEY`, and Daytona credentials
live in `OPENSWE_SECRET_GROUP`.

`OPENSWE_DISABLE_REPO_AUTH=1` lets the harness accept ordinary agent messages
without repo provider credentials. Repo clone, push, and PR workflows should be
enabled separately when those credentials are intentionally configured.

`OPENSWE_DASHBOARD_AUTH_DISABLED=1` keeps the dashboard API open for demo
deployments. Turn this off before production use.

Open SWE creates a new Daytona sandbox per new Open SWE thread. The demo
deployment labels those sandboxes with `harness=openswe`, stops them after 5
minutes, archives them after 15 minutes, and deletes them after 60 minutes so
the Daytona disk quota does not fill up.

Slack-created sessions need a fallback repository because the Open SWE dashboard
normally reads that from a logged-in user's profile. Set `OPENSWE_DEFAULT_REPO`
to an `owner/repo` value before deploying.

## Deploy

Render this template with:

```bash
make deploy-openswe-secrets
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

## Slack bridge

Open SWE uses the same shared Slack HTTP Events bridge as Claude Code, with an
Open SWE dashboard compatibility profile. The bridge maps Slack thread messages
to Open SWE dashboard thread APIs:

- `POST /dashboard/api/threads`
- `POST /dashboard/api/threads/{session_id}/messages`
- `GET /dashboard/api/threads/{session_id}/stream`

Use a separate Slack app/bot for Open SWE. Do not reuse Donna's Claude Code bot
token. Store the Open SWE app credentials in `${OPENSWE_SLACK_SECRET_GROUP}`.

Render and deploy:

```bash
make render-openswe-slack
make deploy-openswe-slack
```

Open SWE can keep its stream endpoint open without sending bytes while a run is
still working. The Slack bridge sets `HARNESS_IGNORE_EVENT_TIMEOUTS=true` so
those waits do not become Slack-visible errors.

Create or update the Slack app from this copy-paste manifest:

```text
harnesses/openswe/deployments/template/slack-app-manifest.editable.json
```

Before pasting, copy the harness-local env example to `.env` and set
`HARNESS_API_URL` to the public Slack bridge URL:

```text
harnesses/openswe/deployments/template/.env
```

The editable manifest uses `${HARNESS_API_URL}/slack/events`. If you run
`make render-openswe-slack`, that harness-local `.env` value is used for
`.rendered/openswe/slack-app-manifest.json`.
