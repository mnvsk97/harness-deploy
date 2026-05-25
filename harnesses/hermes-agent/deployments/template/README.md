# Hermes Agent API

This deployment starts Hermes fresh with only the OpenAI-compatible API server
enabled. Messaging platforms are intentionally disabled until the API path is
verified.

Copy the root env example and set environment-specific values:

```bash
cp .env.example .env
```

## Components

- `hermes-state`: fresh dynamic TrueFoundry volume mounted at `/opt/data`.
- `hermes-api`: Hermes gateway process with `API_SERVER_ENABLED=true`.

## Model Routing

Hermes uses the bundled TrueFoundry provider:

```yaml
model:
  provider: truefoundry
  default: openai-main/gpt-5.5
```

The service reads TFY Gateway credentials from:

- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-BASE-URL`
- `tfy-secret://${TFY_SECRET_TENANT}:${TFY_GATEWAY_SECRET_GROUP}:TFY-GATEWAY-API-KEY`

The public Hermes API bearer token comes from:

- `tfy-secret://${TFY_SECRET_TENANT}:${CODEX_GATEWAY_SECRET_GROUP}:CODEX-GATEWAY-BEARER-TOKEN`

## Apply Order

```bash
make deploy-hermes-agent
```
