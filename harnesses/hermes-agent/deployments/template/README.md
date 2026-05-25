# Hermes Agent API

This deployment starts Hermes fresh with only the OpenAI-compatible API server
enabled. Messaging platforms are intentionally disabled until the API path is
verified.

Copy the root env example and set environment-specific values:

```bash
cp .env.example .env
```

## Components

- `hermes-state-block`: fresh dynamic TrueFoundry block volume mounted at `/opt/data`.
- `hermes-api`: Hermes gateway process with `API_SERVER_ENABLED=true`.
- `hermes-state-backup`: manual backup job for exporting `/opt/data`.

## Model Routing

Hermes uses a named OpenAI-compatible custom provider pointed at TFY Gateway:

```yaml
custom_providers:
  - name: tfy-gateway
    base_url: ${TFY_BASE_URL}
    key_env: TFY_API_KEY
    api_mode: chat_completions
model:
  provider: custom:tfy-gateway
  default: openai-main/gpt-5.5
```

The service reads TFY Gateway credentials from:

- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL`
- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY`

The public Hermes API bearer token comes from:

- `tfy-secret://${TFY_SECRET_TENANT}:${CODEX_GATEWAY_SECRET_GROUP}:CODEX-GATEWAY-BEARER-TOKEN`

Clients must send it as:

```http
Authorization: Bearer <CODEX-GATEWAY-BEARER-TOKEN>
```

For token rotation, update the `CODEX-GATEWAY-BEARER-TOKEN` secret in
`${CODEX_GATEWAY_SECRET_GROUP}`, then restart or redeploy clients that cache
the token. The Hermes service reads the secret from TrueFoundry at pod start.

## Runtime State

Hermes stores state under `/opt/data` and uses `/opt/data/home` as `HOME`.
The startup command only creates `config.yaml` when it is missing. To force the
manifest-owned config to be rewritten on boot, set:

```yaml
HERMES_REFRESH_CONFIG: "true"
```

Keep `replicas: 1`. The state volume is block-backed and intended for one
writer. The rollout strategy uses `max_surge_percentage: 0` so TrueFoundry
does not mount the same block volume into two API pods during replacement.

## Backup

The block volume survives pod replacement, but it is not a backup. Use the
manual `hermes-state-backup` job before risky changes and on a regular
operational cadence.

Because this is a single-writer block volume, pause or scale down `hermes-api`
before running the backup job. The job creates a tarball of `/opt/data`.

By default it writes the archive under `/opt/data/backups`, which is useful for
manual export but does not protect against volume loss. For durable off-volume
backup, set `HERMES_BACKUP_UPLOAD_URL` in the rendered job to a one-time upload
URL or a `tfy-secret://...` reference resolving to one.

Render the job:

```bash
make render-hermes-agent
```

Apply or trigger the rendered backup job only during a maintenance window.

## Smoke Test

After deploy, run:

```bash
HERMES_API_TOKEN=<CODEX-GATEWAY-BEARER-TOKEN> make smoke-hermes-agent
```

The smoke test checks `/health`, `/v1/models`, and a default-model
`/v1/chat/completions` request without passing a `model` field.

## Apply Order

```bash
make deploy-hermes-agent
```
