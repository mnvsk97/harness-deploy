# Open Agents Deploy Plan

## Repo Findings

- Runtime: Bun monorepo with Next.js app in `apps/web`.
- Package manager: `bun@1.2.14`.
- Web scripts:
  - build: `bun run db:migrate:apply && next build`
  - start: `next start`
- Database: Postgres via `POSTGRES_URL`; migrations run during build.
- Optional cache: `REDIS_URL` or `KV_URL`.
- Auth: Better Auth with Vercel OAuth and GitHub App OAuth.
- Sandbox backend: currently Vercel Sandbox only.
- Workflow runtime: `workflow/next` and Workflow SDK routes inside the Next.js app.
- Default sandbox ports: `3000`, `5173`, `4321`, `8000`.

## TrueFoundry Components

- `Service`: Next.js web app and API surface.
- `SecretGroup`: auth, GitHub App, Vercel OAuth, Postgres, Redis/KV, Slack.
- External Postgres: required. Use managed Postgres or an existing database.
- External Redis/KV: optional but recommended for production cache behavior.
- Optional `Service`: Slack bridge if you want Slack to create sessions/prompts.

## Recommended First Deploy

Use `service-prebuilt.yaml` with an image you build from `Dockerfile.tfy`. This
keeps the first TrueFoundry apply path clean:

```bash
tfy apply -f harnesses/open-agents/manifests/secret-group.example.yaml
tfy apply -f harnesses/open-agents/manifests/service-prebuilt.yaml
```

If you want TrueFoundry to build from source, copy `Dockerfile.tfy` into a fork
of `vercel-labs/open-agents`, then adapt `service-source-build.template.yaml`
and use the source-build deploy path for your TrueFoundry version.

## Slack Path

Open Agents does not ship a Slack app adapter. Use `shared/slack` bridge mode:

1. Deploy Open Agents web service.
2. Deploy a Slack bridge that connects with Socket Mode.
3. Configure the bridge to call Open Agents API/session endpoints or a thin API
   you add to create a session and append a user message.

## Migration Path Away From Vercel Coupling

Phase 1 keeps Vercel Sandbox and Vercel OAuth while moving the app/control plane
to TrueFoundry.

Phase 2 replaces `packages/sandbox/vercel` with another implementation such as
E2B, Daytona, or a TrueFoundry-hosted sandbox service. The repo already has a
sandbox factory abstraction, so this is plausible but not manifest-only.
