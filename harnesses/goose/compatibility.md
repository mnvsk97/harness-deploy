# Goose Compatibility Notes

## Direct Fit

- Goose CLI runs map to TrueFoundry `Job`.
- `goosed agent` maps to TrueFoundry `Service` if the image includes the server binary.
- Goose's external server settings make it plausible to run the server remotely and connect clients to it.

## Needs Adaptation

- The upstream Dockerfile copies only `/usr/local/bin/goose`; the server service template expects `/usr/local/bin/goosed`.
- MCP commands are not automatically TrueFoundry remote MCP registrations. Register them only when exposed over supported transport.
- TLS should be handled at the platform ingress unless you intentionally run TLS inside the pod.
- `goosed` includes HTTP routes and ACP/MCP-related surfaces. For this project,
  keep the first TrueFoundry exposure to HTTP request/response and SSE-compatible
  routes; do not rely on WebSocket-first surfaces.

## Risk

Goose is a powerful local-agent system. Be strict with server secrets, provider keys, and exposed hosts.
