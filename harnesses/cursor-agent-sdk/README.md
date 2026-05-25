# Cursor Agent SDK TrueFoundry Harness

Source repo: https://github.com/cursor/cookbook

Research snapshot: `.research/repos/cursor-agent-sdk` at `4ea8442`.

The self-hosted cloud-agent path is the closest deployable target: TrueFoundry runs outbound Cursor worker pods, while Cursor still handles orchestration and model inference.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: worker model caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: Cursor API key.
- `manifests/service.yaml`: outbound worker deployment.
- `manifests/management-service.template.yaml`: optional exposed management port.
