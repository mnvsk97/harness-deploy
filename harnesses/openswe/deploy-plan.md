# Open SWE Deploy Plan

## Repo Findings

- Runtime: Python with `uv`.
- Framework: LangGraph plus Deep Agents.
- Server command for local/dev mode: `uv run langgraph dev --no-browser`.
- Default local server port: `2024`.
- HTTP routes include:
  - `POST /webhooks/github`
  - `POST /webhooks/linear`
  - `GET /webhooks/linear`
  - `POST /webhooks/slack`
  - `GET /webhooks/slack`
  - `GET /health`
- `langgraph.json` defines graph entrypoints plus the FastAPI app at
  `agent.webapp:app`.
- Sandbox providers are external to TrueFoundry. Open SWE supports LangSmith,
  Modal, Daytona, Runloop, and local backends.

## TrueFoundry Mapping

- Primary component: `Service`.
- Credentials: `SecretGroup`.
- Sandbox: external provider configured through `SANDBOX_TYPE` and the matching
  provider key secret.
- Public exposure: the Harness Exposure Layer should be the stable client API.
- Harness-native exposure: GitHub, Linear, and Slack webhook endpoints can be
  exposed as namespaced extension routes or direct webhook routes with the same
  auth and ingress controls.

## Deployment Steps

1. Create `openswe-secrets`.
2. Choose `SANDBOX_TYPE` and provide the matching provider secret.
3. Deploy the Open SWE service.
4. Point GitHub, Linear, and Slack webhooks at the exposed webhook routes.
5. Put the service behind the Harness Exposure Layer for standard session/event
   interaction.
6. Verify a GitHub, Linear, or Slack trigger creates a run and posts back.

