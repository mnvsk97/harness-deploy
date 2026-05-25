# Goose Deploy Plan

## Repo Findings

- Runtime: Rust workspace with CLI and server crates.
- CLI binary: `goose`.
- Server binary: `goosed` in `crates/goose-server`.
- Server command: `goosed agent`.
- MCP server command family: `goosed mcp <server>`.
- Server config uses `GOOSE_` environment variables, including `GOOSE_SERVER__SECRET_KEY`.
- Server defaults include localhost binding and TLS behavior, so TrueFoundry needs explicit host/port/TLS env.
- The upstream Dockerfile builds/copies the `goose` CLI binary. A server image should add `goosed`.
- The current source repository has moved under `aaif-goose/goose`; keep old
  `block/goose` references only for historical notes.

## TrueFoundry Components

- `SecretGroup`: provider keys and Goose server secret.
- `Job`: good fit for one-shot CLI runs.
- `Service`: good fit for `goosed agent` once the image includes `goosed`.
- `Volume`: optional config/session/workspace persistence.
- `MCPServer`: register only after exposing a remote MCP endpoint over HTTP/SSE/streamable HTTP.

## Recommended First Deploy

Start with the renderable server template:

```bash
make render-goose
tfy apply -f .rendered/goose/secret-group.yaml
tfy apply -f .rendered/goose/volume.yaml --dry-run --show-diff
make deploy-goose
```

The CLI job remains useful for validating the upstream `goose` image path, but
the TrueFoundry service path should use `deployments/template/api-service.yaml`
because it builds the missing `goosed` binary.

`tfy deploy` in CLI `0.13.12` does not expose a dry-run flag, and
`tfy apply --dry-run` rejects local source-build service manifests. Validate
the rendered YAML locally, dry-run the volume, then use `tfy deploy` for the
service build/deploy.

The service manifest sets `local_build: false` because this deployment should
not depend on a local Docker daemon.

## TrueFoundry Apply Order

1. Ensure `.env` has `GOOSE_API_HOST`, `GOOSE_MODEL`, `GOOSE_SECRET_GROUP`,
   `GOOSE_SECRET_INTEGRATION_FQN`, `GOOSE_SECRET_ADMIN_EMAIL`, and
   `GOOSE_STORAGE_CLASS`.
2. Run `make render-goose`.
3. Apply a rendered Goose secret group with `GOOSE-SERVER-SECRET-KEY`.
4. Dry-run and apply `.rendered/goose/volume.yaml`.
5. Deploy `.rendered/goose/api-service.yaml` with `tfy deploy`.
6. Register remote MCP only after a compatible endpoint exists.
