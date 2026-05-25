# Open SWE Compatibility

Status: `expected`

Expected fit: strong.

Known caveats:

- Open SWE is already a service-oriented harness, so it maps more naturally to a
  TrueFoundry `Service` than to a `Job`.
- Its production docs point to LangGraph Cloud. On TrueFoundry, the service
  needs an equivalent source-build/runtime path for the LangGraph server.
- It assumes external sandbox providers for real coding work. Do not treat the
  TrueFoundry service container as the sandbox unless explicitly running in
  lower-isolation `sandbox.provider: none` mode.
- Webhook endpoints must be protected with the correct GitHub, Linear, and Slack
  signing secrets.
- If the upstream LangGraph server uses protocol features that do not fit the
  TrueFoundry ingress path, expose HTTP webhook routes and polling/SSE-compatible
  status routes through the Harness Exposure Layer.

Compatibility level: `service-adapted`.

