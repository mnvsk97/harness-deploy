# Pi TrueFoundry Harness

Source repo: https://github.com/earendil-works/pi

Research snapshot: `.research/repos/pi` at `3eb0027`.

Pi is a terminal-first coding agent harness, but the scalable TrueFoundry path
uses Pi's steppable runtime surface rather than a PTY. The service deployment
wraps `pi --mode steppable-rpc` behind HTTP/SSE and persists snapshots, events,
and workspace state on a TrueFoundry volume.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: CLI/RPC caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: provider keys.
- `manifests/volume.yaml`: Pi state/workspace volume.
- `manifests/job.yaml`: one-shot `pi -p` job.
- `manifests/rpc-worker.template.yaml`: wrapper template.
- `gateway/`: steppable HTTP/SSE gateway.
- `deployments/template/`: production service + volume deployment templates.
