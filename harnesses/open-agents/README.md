# Open Agents TrueFoundry Harness

Source repo: https://github.com/vercel-labs/open-agents

Research snapshot: `.research/repos/open-agents` at `24d679c`.

Open Agents is a Next.js reference app for background coding agents. It includes
the web UI, auth, chat/session storage, Workflow SDK-backed agent runs, GitHub
integration, and Vercel Sandbox orchestration.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: Vercel-specific constraints and migration path.
- `smoke-test.md`: validation steps.
- `Dockerfile.tfy`: Dockerfile template for a fork or local source deployment.
- `manifests/secret-group.example.yaml`: app, auth, GitHub, Vercel, Redis, and Slack secrets.
- `manifests/service-prebuilt.yaml`: apply-compatible service using a prebuilt image.
- `manifests/service-source-build.template.yaml`: source-build template using `Dockerfile.tfy`.
- `manifests/postgres.external.md`: Postgres requirements.
- `manifests/redis.external.md`: optional Redis/KV cache notes.
