# harness-deploy Codex Guidance

- Treat TrueFoundry as the deploy/control-plane substrate, not as a sandbox provider by default. Sandboxes should be evaluated separately, such as Daytona, E2B, or another isolated workspace runtime.
- TrueFoundry does not support WebSocket protocol surfaces in this project context. When a harness, UI, gateway, or API assumes WebSockets, always look for an alternate design first: HTTP request/response, Server-Sent Events, polling, webhooks, queued jobs, or outbound worker callbacks.
- Keep manifests TrueFoundry-native: prefer `Service`, `Job`, `Volume`, `SecretGroup`, and `MCPServer` only where those components match the actual runtime shape.
- For larger changes, start with a concise plan before editing, then verify the touched files.
