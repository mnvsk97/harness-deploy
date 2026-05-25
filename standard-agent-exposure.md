# Standard Agent Harness Exposure

This repo standardizes how deployed agent harnesses are exposed when TrueFoundry
is the deployment substrate. The goal is a Dari-like user experience using
existing TrueFoundry components, while keeping sandbox providers separate from
TrueFoundry services and jobs.

## Product Boundary

TrueFoundry runs and operates the control-plane pieces:

- coordinator APIs
- harness adapters
- workers
- gateway services
- one-shot jobs
- volumes
- secrets
- MCP registrations

TrueFoundry `Service` and `Job` resources are not sandboxes. Per-session
sandboxes must be selected separately, such as Daytona, E2B, Morph, another
isolated workspace runtime, or a future internal sandbox provider.

## Harness Exposure Layer

The product should have one standard layer for interacting with every harness
deployed through TrueFoundry: the Harness Exposure Layer.

This layer is a TrueFoundry-hosted API and coordinator that owns:

- agent records and versions
- session records
- event logs
- status transitions
- harness adapter routing
- authentication and authorization
- workspace and artifact references
- streaming or polling fallbacks
- namespaced harness-native extensions

Clients should integrate with this layer instead of integrating directly with
Hermes, Pi, Codex, Claude Code, Goose, OpenClaw, or any other harness runtime.
The harness runtime can expose native ports or APIs internally, but those are
adapter inputs, not the stable product contract.

Each harness plugs into the layer through a harness adapter. The adapter is
responsible for translating the standard session/event model into the
harness-native command, API, file layout, process model, and protocol.

## Required Shape

Every deployed harness should expose the same logical surface, even when the
underlying harness runs differently.

```text
Client
  -> Harness Exposure API
      -> session coordinator
          -> harness adapter
              -> sandbox provider
                  -> harness runtime
```

The harness runtime can be Codex, Claude Code, Cursor Agent SDK, Hermes Agent,
OpenClaw, Pi, Open Agents, DeepAgents, Open SWE, Goose, or another agent loop.
The client should not need to know whether the harness is backed by a
long-running service, a queued worker, or a per-message job.

## Deployment Spec

Every harness deployment should be describable with a small standard spec. The
exact file format can evolve, but the concepts should stay stable.

```yaml
name: personal-hermes
harness: hermes-agent
version: latest

model:
  provider: truefoundry-ai-gateway
  base_url: ${TFY_AI_GATEWAY_BASE_URL}
  model: openai/gpt-5.5

sandbox:
  provider: daytona
  api_key_secret: tfy-secret://WORKSPACE_OR_USER:hermes-secrets:DAYTONA_API_KEY
  options:
    image: nikolaik/python-nodejs:python3.11-nodejs20
    persistent: true
    timeout_seconds: 180

state:
  volume: hermes-state
  mount_path: /opt/data

exposure:
  public_api: true
  stream: sse-with-polling-fallback
  expose_harness_native_api: false
```

The required fields are:

- `harness`: the runtime adapter to use.
- `model`: the model access path, preferably TrueFoundry AI Gateway.
- `sandbox.provider`: the sandbox backend, or `none` for host execution.
- `sandbox.api_key_secret`: TFY secret FQN for the sandbox provider key, unless
  the provider is `none` or platform-managed.
- `state`: the durable state location for the harness.
- `exposure`: how the standard API is exposed.

For no-sandbox deployments:

```yaml
sandbox:
  provider: none
```

That mode must be labelled as host execution. The adapter should document the
weaker isolation and restrict dangerous tools by default.

## Protocol Rule

Do not design WebSocket-first surfaces for TrueFoundry deployments.

Allowed alternatives:

- HTTP request/response for commands and status reads
- Server-Sent Events for live event streams when supported by the ingress path
- polling for status and transcripts
- webhooks for lifecycle and external tool callbacks
- queue-backed workers for async execution
- outbound worker callbacks for platforms that require long-lived outbound
  connections

If an upstream harness depends on WebSockets, the adapter must translate it to
one of the supported alternatives before it becomes the exposed product surface.

## Standard API

The stable exposure surface should be small and session-oriented.

```text
POST /v1/agents
GET  /v1/agents/{agent_id}
POST /v1/agents/{agent_id}/versions
POST /v1/agents/{agent_id}/sessions
GET  /v1/sessions/{session_id}
POST /v1/sessions/{session_id}/events
GET  /v1/sessions/{session_id}/events
GET  /v1/sessions/{session_id}/stream
POST /v1/sessions/{session_id}/resume
POST /v1/sessions/{session_id}/cancel
GET  /v1/sessions/{session_id}/workspace
GET  /v1/sessions/{session_id}/logs
```

`/stream` should use Server-Sent Events where possible. If SSE is not viable in
the target environment, clients must be able to fall back to polling
`/events`.

## Harness-Native Endpoints

Some harnesses expose useful endpoints beyond the standard session API: health
checks, repository indexing, dashboard data, MCP surfaces, trace views, artifact
download helpers, model/provider configuration, or harness-specific admin
actions. These endpoints are allowed, but they must not replace the standard
session contract.

Classify every non-standard endpoint into one of these tiers:

| Tier | Use |
| --- | --- |
| `core` | Required standard endpoints listed above. Every exposed harness should support these through the adapter. |
| `extension` | Product-supported harness-specific endpoints that clients may call deliberately. |
| `internal` | Operational endpoints for health, metrics, readiness, debug, dashboards, or worker control. |
| `deprecated` | Upstream or compatibility endpoint kept temporarily with a migration path. |

Expose extension endpoints under a namespaced path so they cannot collide with
the standard API:

```text
/v1/harnesses/{harness_name}/...
/v1/agents/{agent_id}/harness/...
/v1/sessions/{session_id}/harness/...
```

Use the narrowest scope:

- agent-level endpoint for configuration or version-level data
- session-level endpoint for runtime/session data
- harness-level endpoint for static capabilities or adapter metadata

Rules for harness-native endpoints:

- They must use the same authentication and authorization model as the standard
  API.
- They must avoid WebSocket-only exposure. Use HTTP, SSE, polling, webhooks, or
  queued callbacks.
- They must be documented in the harness folder's `compatibility.md`.
- They must declare whether they are stable product surface or best-effort
  pass-through to the upstream harness.
- They must not be required for a generic client to create a session, send
  input, read events, inspect status, or fetch outputs.
- If an endpoint becomes generally useful across multiple harnesses, promote it
  into the standard API instead of duplicating it as many harness-specific
  extensions.

For upstream dashboards or admin UIs, prefer exposing them as separate
TrueFoundry `Service` ports or internal routes and link them from session or
agent metadata. Do not make dashboard-only endpoints the canonical automation
API.

## Session Lifecycle

Every harness adapter should implement this lifecycle:

```text
created
  -> starting
  -> running
  -> waiting_for_input
  -> waiting_for_tool
  -> completed
  -> failed
  -> cancelled
```

The coordinator owns the lifecycle state. The harness runtime can keep its own
native state, but it must report state changes back through the common event
contract.

## Event Contract

Events should be append-only and replayable.

```json
{
  "id": "evt_...",
  "session_id": "sess_...",
  "sequence": 12,
  "type": "assistant.message",
  "created_at": "2026-05-24T00:00:00Z",
  "payload": {
    "text": "Done."
  }
}
```

Recommended event types:

```text
user.message
assistant.message
harness.started
harness.status
harness.checkpointed
tool.call_requested
tool.result_submitted
workspace.file_created
workspace.file_updated
run.completed
run.failed
run.cancelled
```

The event log is the product-level history. Native harness logs are useful for
debugging, but they are not the stable client contract.

## State Contract

Each session needs a predictable workspace and state layout.

```text
/workspace/sessions/<session_id>/
  workspace/        # user-visible files
  state/            # harness-native state
  checkpoints/      # resumability artifacts where supported
  artifacts/        # outputs intended for download
```

Required environment variables for harness adapters:

```text
HARNESS_AGENT_ID
HARNESS_VERSION_ID
HARNESS_SESSION_ID
HARNESS_WORKSPACE_DIR
HARNESS_STATE_DIR
HARNESS_EVENT_CALLBACK_URL
TFY_AI_GATEWAY_BASE_URL
```

Harness-specific variables can be added, for example `HERMES_HOME`, but they
should be derived from the standard workspace/state paths.

## TrueFoundry Component Mapping

Use TrueFoundry components for the control-plane and runtime infrastructure:

| Need | TrueFoundry component |
| --- | --- |
| Public HTTP API | `Service` |
| Long-running harness gateway | `Service` |
| Async adapter or outbound worker | `Service` |
| One-shot harness run | `Job` |
| Persistent state and workspace cache | `Volume` |
| Provider keys and channel tokens | `SecretGroup` |
| Model routing and governance | AI Gateway |
| MCP-compatible exposed surface | `MCPServer` |

Use external or dedicated sandbox providers for isolated per-session execution:

| Need | Sandbox layer |
| --- | --- |
| Per-session coding workspace | Daytona / E2B / equivalent |
| Browser-enabled isolated runtime | sandbox provider with browser support |
| Network-restricted tool execution | sandbox provider policy |
| Snapshot/resume of runtime filesystem | sandbox provider or object snapshot layer |

## Harness Adapter Requirements

Each adapter must document:

- how to start a session
- how to send input to the harness
- how to collect assistant output
- how tool calls are represented
- how workspace files are stored
- whether the harness supports checkpoint/resume
- what happens when a run is interrupted
- which protocols the upstream harness expects
- which non-WebSocket alternative is used for the exposed surface
- how the standard deployment spec maps to harness-native config
- which sandbox providers are supported
- how `sandbox.provider: none` behaves, if supported

## Reference Deployment Pattern

For the first implementation, prefer this shape:

```text
Service: harness-exposure-api
Service: <harness>-adapter-worker
Volume: harness-session-state
SecretGroup: harness-runtime-secrets
AI Gateway: model access
Sandbox provider: Daytona or E2B
```

The API service owns sessions and events. The adapter worker translates common
session events into harness-native execution. The sandbox provider owns isolated
workspace execution. TrueFoundry owns deployment, scaling, secrets, logs,
volumes, and model gateway access.

## Compatibility Levels

Each harness should be classified before it is exposed:

| Level | Meaning |
| --- | --- |
| `api-native` | Harness already exposes an HTTP-compatible API. |
| `service-adapted` | Harness runs as a service but needs a thin adapter. |
| `job-adapted` | Harness is CLI-first and runs per request or per session as a job. |
| `steppable` | Harness can pause at model/tool/wait boundaries and resume. |
| `checkpoint-only` | Harness can persist local state, but cannot fully step turns. |
| `not-ready` | Harness requires protocol/runtime behavior that has no safe adapter yet. |

Steppable harnesses are closest to Dari's durable session model. Checkpoint-only
or job-adapted harnesses can still be exposed, but the product must be honest
about weaker resume semantics.
