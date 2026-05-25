# Open Agents Compatibility Notes

## Direct Fit

- The Next.js web app maps to a TrueFoundry `Service`.
- Postgres and Redis/KV map to external managed services referenced through a
  TrueFoundry `SecretGroup`.
- GitHub App and OAuth secrets map cleanly to env vars.

## Needs Adaptation

- The repo is intentionally tied to Vercel Workflow and Vercel Sandbox today.
- There is no upstream Dockerfile in the snapshot inspected here.
- Vercel OAuth callback URLs must point to the TrueFoundry-hosted domain.
- GitHub App callback/setup URLs must point to the TrueFoundry-hosted domain.
- If Workflow SDK requires Vercel-specific backing services at runtime, a
  non-Vercel deployment may need extra workflow infrastructure or code changes.
- Slack is not native; use a bridge or add an API route.

## Risk

This is the most Vercel-coupled harness in the set. It is still worth including
because the control plane is a normal Next.js app, but the sandbox/workflow layer
should be treated as phase-two engineering rather than a pure manifest exercise.
