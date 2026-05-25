# Pi Deploy Plan

## Repo Findings

- Runtime: Node package `@earendil-works/pi-coding-agent`.
- Minimum Node: `>=22.19`.
- CLI binary: `pi`.
- Non-interactive mode: `pi -p "prompt"`.
- Programmatic modes include JSON, RPC, and `steppable-rpc`.
- Important state env: `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, `PI_PACKAGE_DIR`.
- Common provider secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and provider-specific keys.

## TrueFoundry Components

- `SecretGroup`: provider keys.
- `Service`: best fit for durable session APIs using `steppable-rpc`.
- `Job`: useful for one-shot prompts and operational checks.
- `Volume`: optional persistent Pi sessions/workspace.
- `Volume`: required for the current service gateway because snapshots, events,
  Pi state, and workspaces are local-durable.

## Recommended First Deploy

Start with `deployments/template/service.yaml` and `deployments/template/volume.yaml`.
Keep `PI_TELEMETRY=0` for predictable enterprise deployment.

## TrueFoundry Apply Order

1. Ensure the TrueFoundry Gateway secret group exists.
2. Ensure the Pi gateway bearer-token secret exists.
3. Render and apply `deployments/template/volume.yaml`.
4. Render and deploy `deployments/template/service.yaml`.
5. Use `manifests/job.yaml` only for finite one-shot runs.
