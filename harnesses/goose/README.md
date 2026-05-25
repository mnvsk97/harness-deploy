# Goose TrueFoundry Harness

Source repo: https://github.com/aaif-goose/goose

Research snapshot: `.research/repos/goose` at `ce004f7`.

Goose has both a CLI and `goosed` server binary in the repo. The upstream
Dockerfile currently copies the `goose` CLI binary; the deployment template in
`deployments/template` builds a dedicated `goosed` server image.

## Files

- `deploy-plan.md`: repo findings and TrueFoundry mapping.
- `compatibility.md`: CLI/server caveats.
- `smoke-test.md`: validation steps.
- `manifests/secret-group.example.yaml`: provider and server secret.
- `manifests/volume.yaml`: Goose state/workspace volume.
- `manifests/job.yaml`: CLI job template.
- `manifests/service-goosed.template.yaml`: server service template.
- `manifests/mcp-server-remote.template.yaml`: remote MCP registration template.
- `goosed-image/Dockerfile`: TrueFoundry build image for `goosed agent`.
- `deployments/template`: renderable deployment matching the Codex/Hermes flow.
