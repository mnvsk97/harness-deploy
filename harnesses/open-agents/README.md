# Open Agents

Source repo: https://github.com/vercel-labs/open-agents

Research snapshot: `.research/repos/open-agents` at `24d679c`.

Open Agents is a Next.js reference app for background coding agents. TrueFoundry
can host the app/control plane, while Postgres, Redis/KV, GitHub, and sandbox
services remain external dependencies.

## TrueFoundry Mapping

| Original repo surface | TrueFoundry component | Notes |
| --- | --- | --- |
| Next.js web/API app | `Service` | Main app surface. |
| Auth, GitHub, Slack, Vercel, DB credentials | `SecretGroup` | Stores app and integration secrets. |
| Postgres | External database | Required; not bundled into this manifest. |
| Redis/KV | External cache | Optional but recommended. |
| Vercel Sandbox backend | External sandbox | Replace later with Daytona/E2B/etc. if desired. |
| Slack bot | Optional bridge `Service` | Use shared Slack bridge or add native API routes. |

## Start Here

- Full mapping notes: `deploy-plan.md`
- Compatibility notes: `compatibility.md`
- Smoke tests: `smoke-test.md`
