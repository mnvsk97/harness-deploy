# Open SWE

Source repo: https://github.com/langchain-ai/open-swe

Open SWE is a LangGraph and Deep Agents based asynchronous coding-agent harness.
This repo runs it as a long-running HTTP service with Daytona for sandboxing and
TrueFoundry Gateway for model access.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| LangGraph/FastAPI server | `Service` | Main deployed Open SWE service. |
| Daytona sandbox credentials | `SecretGroup` | Stores `DAYTONA_API_KEY` and related runtime secrets. |
| Model access | `SecretGroup` | Routes through TrueFoundry Gateway via `OPENAI_BASE_URL` and key. |
| LangGraph threads/runs | Service API | Treated as harness-native APIs behind the standard exposure layer. |
| Slack bot | `Service + SecretGroup + Volume` | Uses the shared HTTP Events bridge, not Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
