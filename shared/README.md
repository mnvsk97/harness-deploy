# Shared TrueFoundry Patterns

These files are templates reused by the harness folders.

For the common deployed-agent API, lifecycle, event, and state contract, see
[standard-agent-exposure.md](../standard-agent-exposure.md).

## Required Placeholders

- `WORKSPACE_FQN_HERE`: target TrueFoundry workspace FQN.
- `REGISTRY_FQN_OR_OMIT`: Docker registry FQN if the cluster requires one for builds.
- `*.YOUR_TFY_BASE_DOMAIN`: replace with the cluster base domain before exposing a port.
- `tfy-secret://...`: replace with real TrueFoundry secret FQNs.

## Component Rules

- Use `Service` for long-running gateways, workers, HTTP APIs, dashboards, and outbound workers.
- Use `Job` for one-shot repo tasks, benchmark runs, and non-interactive CLI prompts.
- Use `Volume` for home/config/workspace/session state.
- Use `SecretGroup` for API keys and channel credentials.
- Use `MCPServer` only when the harness exposes a stable HTTP/SSE/stdout MCP surface.
- Do not treat `Service` or `Job` as the sandbox provider. Choose Daytona, E2B,
  or another isolated workspace runtime separately when per-session sandboxing is
  required.
- Do not expose WebSocket-first surfaces on TrueFoundry. Prefer HTTP,
  Server-Sent Events, polling, webhooks, queued jobs, or outbound callbacks.
- Use `shared/slack` to add Slack Socket Mode env vars or a bridge service.
- Use `tfy apply` for prebuilt-image manifests and supported declarative resources.
- Use `tfy deploy` for source-build manifests that include `build_source`.

## Validation Loop

```bash
tfy apply -f manifest.yaml --dry-run --show-diff
tfy apply -f manifest.yaml
```

After apply, inspect application state, resources, logs, and health endpoints.
