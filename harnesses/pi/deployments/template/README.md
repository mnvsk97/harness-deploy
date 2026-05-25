# Pi Steppable Deploy

This deployment exposes Pi as a durable HTTP/SSE service using Pi's
`steppable-rpc` mode. It intentionally avoids a PTY wrapper.

The gateway drives Pi through explicit boundaries:

- `call_llm`
- `call_tool`
- `wait_for_user`
- persisted snapshots

Render and deploy:

```bash
make deploy-pi
```

Endpoint:

```text
https://${PI_GATEWAY_HOST}
```

API:

```bash
curl -X POST https://$PI_GATEWAY_HOST/v1/agents/pi/sessions \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Create a README that explains this repository structure."}'
```

```bash
curl -X POST https://$PI_GATEWAY_HOST/v1/sessions/$SESSION_ID/events \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"message":"Continue and include deployment risks."}'
```

```bash
curl -N https://$PI_GATEWAY_HOST/v1/sessions/$SESSION_ID/stream \
  -H "authorization: Bearer $PI_GATEWAY_TOKEN"
```

Notes:

- `GATEWAY_BEARER_TOKEN` uses the Pi gateway bearer-token secret.
- Model calls are routed through the TrueFoundry Gateway secret group.
- The service uses a block volume and one replica because the current gateway
  persists snapshots, event logs, Pi state, and workspace files on the mounted
  volume.
- The current gateway executes Pi tools in the service workspace. For untrusted
  user workloads, add an external sandbox worker before exposing this broadly.
