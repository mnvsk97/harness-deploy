# Goose Server on TrueFoundry

This deployment builds a small server image for Goose's `goosed agent` binary
because the upstream Goose Dockerfile currently ships only the `goose` CLI.

## Components

- `goose-state-block`: block volume mounted at `/data`.
- `${GOOSE_SECRET_GROUP}`: Goose server auth secret.
- `goose-api`: `goosed agent` listening on HTTP port `3000`.

## Model Routing

The service uses Goose's built-in OpenAI-compatible provider and points it at
the existing TrueFoundry Gateway secrets through `OPENAI_HOST` and
`OPENAI_API_KEY`. `OPENAI_BASE_PATH` is pinned to `/v1/chat/completions` so
Goose does not auto-route GPT-5-family models to the Responses API.

- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL`
- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY`

The external Goose server secret is independent from the Codex and Hermes API
tokens:

- `tfy-secret://${TFY_SECRET_TENANT}:${GOOSE_SECRET_GROUP}:GOOSE-SERVER-SECRET-KEY`

The secret group is created against `${GOOSE_SECRET_INTEGRATION_FQN}`.
`${GOOSE_SECRET_ADMIN_EMAIL}` is granted `secret-group-admin` on the generated
group.

## Apply Order

```bash
make render-goose
tfy apply -f .rendered/goose/secret-group.yaml
tfy apply -f .rendered/goose/volume.yaml --dry-run --show-diff
make deploy-goose
```

The Goose service uses a local source-build manifest, so deploy it with
`tfy deploy`; this TrueFoundry CLI version does not provide a service dry-run
for that path.

The manifest sets `local_build: false` so TrueFoundry builds remotely instead
of requiring Docker on the machine running `make deploy-goose`.

Smoke test:

```bash
curl -i https://$GOOSE_API_HOST/status
curl -i https://$GOOSE_API_HOST/system_info -H "X-Secret-Key: $GOOSE_SERVER_SECRET_KEY"
```

Keep MCP registration separate until the deployed endpoint is intentionally
exposed through a supported remote MCP transport.
