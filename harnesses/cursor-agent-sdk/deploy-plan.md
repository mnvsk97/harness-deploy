# Cursor Agent SDK Deploy Plan

## Repo Findings

- Repo: `cursor/cookbook`.
- Self-hosted path: `self-hosted-cloud-agent`.
- Dockerfile installs the Cursor agent CLI and starts a worker.
- Worker command pattern: `agent worker --pool --pool-name ... --worker-dir ... --idle-release-timeout ... start`.
- The worker makes outbound HTTPS connections to Cursor. It does not need public ingress for normal operation.
- Required secret: `CURSOR_API_KEY`, typically a service-account key.

## TrueFoundry Components

- `SecretGroup`: Cursor API key.
- `Service`: long-running outbound worker.
- Optional `Volume`: worker workspace cache if jobs need persistence.
- Optional exposed `Service` port: only if using the management address.

## Recommended First Deploy

Use `manifests/service.yaml` with one replica and no exposed ports. Scale replicas only after confirming the worker pool behavior.

## TrueFoundry Apply Order

1. Apply `manifests/secret-group.example.yaml`.
2. Fill pool name/repository settings.
3. Apply `manifests/service.yaml`.
4. Add `management-service.template.yaml` only when you explicitly want a management endpoint.
