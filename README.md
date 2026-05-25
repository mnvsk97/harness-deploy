# harness-deploy

Experimental manifest-first deployment recipes for running agent harnesses on
TrueFoundry.

This repo is an experiment to check whether popular coding-agent and agent-app
harnesses can be mapped onto the existing TrueFoundry deployment components, and
whether that mapping can produce production-ready manifests. The goal is to
learn which harnesses fit cleanly into `service`, `job`, `volume`,
`secret-group`, and related TrueFoundry primitives, and where a wrapper,
adapter, or external sandbox provider is still required.

The repo is intentionally not CLI-first. Each harness folder contains
TrueFoundry YAML templates, a deploy plan, smoke-test notes, and compatibility
notes. The default path for apply-compatible manifests is:

```bash
tfy apply -f harnesses/<harness>/manifests/<file>.yaml --dry-run --show-diff
tfy apply -f harnesses/<harness>/manifests/<file>.yaml
```

Use `tfy deploy -f` when a manifest asks TrueFoundry to build from source with
`image.type: build` / `build_source`. Use `tfy apply -f` for prebuilt-image
manifests, secret groups, volumes, and other declarative resources.

## Public Safety

These manifests are public examples, not a blanket production endorsement for
every upstream harness. Before exposing a coding-agent service, configure
gateway authentication, use TrueFoundry Secret Groups for credentials, pin build
inputs, and add an isolated sandbox provider for untrusted workloads. See
[SECURITY.md](SECURITY.md) for the project security policy.

## Folder Structure

```text
harnesses/
  <harness>/
    README.md
    deploy-plan.md
    compatibility.md
    smoke-test.md
    manifests/
      *.yaml
shared/
  README.md
  slack/
  multi-service.md
  *.example.yaml
  *-template.md
scripts/
  slackify_manifest.py
.research/repos/
  <cloned upstream repositories>
```

The `harnesses/*/manifests` files are the product surface: users should be able
to fill placeholders and run `tfy apply -f <manifest.yaml>`.

## Deploy From Templates

Deployment-specific values live in a root `.env`, not in committed manifests.
Committed deployment manifests use `${VAR}` placeholders; `make render-*`
expands them with `envsubst` into ignored `.rendered/` files.

```bash
cp .env.example .env
# edit .env for your tenant, workspace, hosts, and secret groups
```

Render only:

```bash
make render-codex
```

Deploy:

```bash
make deploy-codex
make deploy-claude-code
make deploy-claude-code-slack
make deploy-hermes-agent
make deploy-slack-bridge
make deploy-pi
make deploy-goose
```

The `Makefile` uses `envsubst` directly. On macOS it will find Homebrew's
`envsubst` if it is installed under `/opt/homebrew/bin` or
`/opt/homebrew/opt/gettext/bin`. Do not commit `.env` or `.rendered/` outputs.

## Standard Agent Exposure

Use [standard-agent-exposure.md](standard-agent-exposure.md)
as the target contract for exposing deployed harnesses. The short version:
one TrueFoundry-hosted Harness Exposure Layer owns the public API, sessions,
events, status, and adapter routing. TrueFoundry runs that layer plus services,
jobs, volumes, secrets, and gateway integration; a separate sandbox provider
such as Daytona or E2B owns isolated per-session execution when sandboxing is
enabled. Do not expose WebSocket-first product surfaces from TrueFoundry
deployments. Prefer HTTP, Server-Sent Events, polling, webhooks, queued workers,
or outbound callbacks.

## Harness Status

| Harness | TrueFoundry mapping being tested | Current status | Notes |
| --- | --- | --- | --- |
| Codex | `Service + Volume` HTTP/SSE app-server gateway; optional `Job` for `codex exec` | **Deployed and smoke-tested** | Sessions, fresh context isolation, returning to old sessions, TFY Gateway routing, workspace writes, and persisted volume state work. Uses `danger-full-access` inside the pod because Codex's inner Linux sandbox does not initialize reliably in this Kubernetes runtime. |
| Claude Code | `Service + Volume` PTY-backed HTTP/SSE gateway; `SecretGroup` for gateway auth/model routing | **Template + gateway prototype** | Template exists and renders through `make deploy-claude-code`; needs the same depth of live smoke testing as Codex before calling it production-ready. |
| Hermes Agent | `Service + Volume + SecretGroup` API-server mode | **Template + deployment candidate** | Template exists and renders through `make deploy-hermes-agent`. Native Slack worker mode is not supported in this project because Slack integrations must use HTTP Events API. |
| Cursor Agent SDK | `Service` management/worker surface; optional demo service | **Manifest candidate** | Mapped to long-running service components; not yet live-verified in this repo. |
| Pi | steppable `Service + Volume`; `Job` fallback | **Service template** | Uses `steppable-rpc` behind HTTP/SSE; external sandbox worker still needed before broad untrusted use. |
| OpenClaw | `Service + Volume + SecretGroup` | **Manifest candidate** | Likely needs a standard HTTP harness exposure layer and channel secrets. |
| Open Agents | Next.js `Service + SecretGroup`; external Postgres and optional Redis/KV | **Manifest candidate** | Vercel-tied assumptions need replacement with TrueFoundry service plus external data stores. |
| DeepAgents | `Service` API wrapper or `Job` for one-shot agent runs | **Manifest candidate** | Framework maps cleanly, but production shape depends on the app wrapper and persistence needs. |
| Open SWE | LangGraph/FastAPI `Service + SecretGroup`; external sandbox provider | **Manifest candidate** | Needs sandbox provider wiring such as Daytona/Runloop/E2B/Modal depending on chosen backend. |
| Goose | `Service` for `goosed`, `Job` for CLI runs, optional `mcp-server/remote` registration | **Manifest candidate** | Server mode looks deployable; MCP registration only applies once exposed over HTTP/SSE/streamable transport. |

## TrueFoundry Components Used

| Component | Why it matters for harness deploy |
| --- | --- |
| `service` | Long-running gateways, dashboards, outbound workers, and HTTP wrappers. |
| `job` | One-shot CLI agent runs, benchmark runs, and finite coding tasks. |
| `volume` | Persistent home directories, sessions, workspace cache, and harness state. |
| `secret-group` | Provider keys, channel tokens, worker API keys, and server auth tokens. |
| `mcp-server/remote` | Registration surface only after a harness exposes HTTP/SSE/streamable MCP. |
| `virtual-account` | Optional least-privilege identity for automated apply/deploy flows. |

## Slack Deployment

Use [shared/slack](shared/slack/README.md) for Slack setup. The default pattern
is HTTP Events API: Slack posts events to the TrueFoundry-hosted bridge at
`POST /slack/events`. Socket Mode is always off; do not configure
`SLACK_APP_TOKEN`.

Deploy the target harness gateway first. Point `SLACK_BRIDGE_HARNESS_API_URL` at
that gateway, set `SLACK_BRIDGE_HOST`, and set the target token secret group/key
in `.env`. Then render the Slack app manifest and deploy the bridge:

```bash
make render-slack-bridge
make deploy-slack-bridge
```

Use `.rendered/slack/slack-app-manifest.json` to create or update the Slack app.

The bridge defaults to the standard `/sessions`,
`/sessions/{session_id}/messages`, and `/sessions/{session_id}/events` contract.
Override the path templates in `.env` for harness-specific APIs.

For multi-service harnesses, see [shared/multi-service.md](shared/multi-service.md). The short version: keep each deployable component as its own manifest and apply them in a documented order. Do not use application sets.
