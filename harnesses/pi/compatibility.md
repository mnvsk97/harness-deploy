# Pi Compatibility Notes

## Direct Fit

- `pi -p` maps cleanly to a TrueFoundry `Job`.
- Provider keys map to `SecretGroup`.
- `pi --mode steppable-rpc` maps to a TrueFoundry `Service` gateway because it
  exposes explicit model/tool/user boundaries without controlling a terminal.

## Needs Adaptation

- Interactive TUI mode is not a service.
- RPC and steppable RPC modes still need an HTTP/SSE adapter to expose a stable
  product API.
- Node version must be 22.19 or newer.
- The current service gateway executes Pi tools in the service workspace. For
  untrusted user workloads, add an external sandbox worker before broad use.

## Risk

Pi can run shell tools in the workspace. Use constrained workspaces and separate secrets per deployment.
