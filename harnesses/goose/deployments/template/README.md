# Goose Server on TrueFoundry

This deployment builds a small server image for Goose's `goosed agent` binary
because the upstream Goose Dockerfile currently ships only the `goose` CLI.

## Components

- `goose-state-block`: block volume mounted at `/data`.
- `goose-api`: `goosed agent` listening on HTTP port `3000`.

## Model Routing

The service writes a Goose custom provider config on startup and points it at
the existing TrueFoundry Gateway secrets:

- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL`
- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY`

The external Goose server secret uses the same gateway bearer-token secret as
the Codex and Hermes API surfaces:

- `tfy-secret://${TFY_SECRET_TENANT}:${CODEX_GATEWAY_SECRET_GROUP}:CODEX-GATEWAY-BEARER-TOKEN`

## Apply Order

```bash
make render-goose
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
curl -i https://$GOOSE_API_HOST/system_info -H "X-Secret-Key: $CODEX_GATEWAY_TOKEN"
```

Keep MCP registration separate until the deployed endpoint is intentionally
exposed through a supported remote MCP transport.
