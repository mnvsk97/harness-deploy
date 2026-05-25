# Claude Code Deploy Plan

## Repo Findings

- Runtime: Node-based CLI distribution.
- Install paths in docs/devcontainer include npm package/install script/Homebrew.
- Headless mode: `claude -p` / print mode.
- Common config path: `/home/node/.claude` in the upstream devcontainer.
- Common secrets: `ANTHROPIC_API_KEY`, optionally `ANTHROPIC_AUTH_TOKEN` or custom `ANTHROPIC_BASE_URL`.

## TrueFoundry Components

- `SecretGroup`: Anthropic key/token and base URL if using a gateway.
- `Job`: best fit for bounded coding tasks.
- `Volume`: optional persistence for `.claude` and `/workspace`.
- `Service`: only if a wrapper exposes HTTP around `claude -p` or SDK calls.

## Recommended First Deploy

Use `manifests/job.yaml` with a tiny prompt and no repository mounted. Then add workspace/repo material through a purpose-built image or mounted volume.

## TrueFoundry Apply Order

1. Apply `manifests/secret-group.example.yaml`.
2. Apply `manifests/volume.yaml` if persistence is needed.
3. Apply `manifests/job.yaml`.
4. Build a wrapper before using `worker-service.template.yaml`.
