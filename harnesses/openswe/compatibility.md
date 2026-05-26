# Open SWE Compatibility

Status: `expected`

Expected fit: strong.

Known caveats:

- Open SWE is already a service-oriented harness, so it maps more naturally to a
  TrueFoundry `Service` than to a `Job`.
- Its production docs point to LangGraph Cloud. On TrueFoundry, the service
  needs an equivalent source-build/runtime path for the LangGraph server.
- It assumes an external sandbox provider for real coding work. This harness
  uses Daytona.
- Repo-provider and issue-tracker workflows are intentionally disabled for the
  current message-only mode.
- If the upstream LangGraph server uses protocol features that do not fit the
  TrueFoundry ingress path, expose HTTP webhook routes and polling/SSE-compatible
  status routes through the Harness Exposure Layer.

Compatibility level: `service-adapted`.
