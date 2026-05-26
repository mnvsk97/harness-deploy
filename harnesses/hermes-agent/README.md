# Hermes Agent

Source repo: https://github.com/NousResearch/hermes-agent

Research snapshot: `.research/repos/hermes-agent` at `9c08070`.

Hermes ships Docker and compose paths for a gateway plus optional dashboard/API
server. This repo uses the API-server mode as the durable TrueFoundry entrypoint.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| Hermes API/gateway process | `Service` | Main deployed runtime. |
| `HERMES_HOME` state under `/opt/data` | `Volume` | Keeps Hermes state durable. |
| Provider keys and API token | `SecretGroup` | Stores model/channel credentials and API server key. |
| Dashboard | Optional `Service` | Enable after the API service works. |
| Native Slack worker | Not used | Project uses HTTP Events bridge instead of Socket Mode. |

## Start Here

- Deploy/API details: `deployments/template/README.md`
- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
