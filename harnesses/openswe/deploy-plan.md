# Open SWE Deploy Plan

## Repo Findings

- Runtime: Python with `uv`.
- Framework: LangGraph plus Deep Agents.
- Server command for local/dev mode: `uv run langgraph dev --no-browser`.
- Default local server port: `2024`.
- HTTP routes include `GET /health`, LangGraph thread/run routes, and optional
  webhook routes.
- `langgraph.json` defines graph entrypoints plus the FastAPI app at
  `agent.webapp:app`.
- Sandbox execution uses Daytona.

## TrueFoundry Mapping

- Primary component: `Service`.
- Credentials: `SecretGroup`.
- Sandbox: Daytona configured through `SANDBOX_TYPE=daytona` and
  `DAYTONA_API_KEY`.
- Model access: TrueFoundry Gateway through `OPENAI_BASE_URL` and
  `OPENAI_API_KEY`.
- Public exposure: the Harness Exposure Layer should be the stable client API.
- Repo-provider and issue-tracker integrations are disabled for the current
  harness mode.

## Deployment Steps

1. Create `openswe-secrets`.
2. Store the Daytona API key.
3. Deploy the Open SWE service.
4. Put the service behind the Harness Exposure Layer for standard session/event
   interaction.
5. Verify direct message interaction through the LangGraph run API.
