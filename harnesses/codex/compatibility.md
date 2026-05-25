# Codex Compatibility Notes

## Direct Fit

- `codex exec` maps directly to a TrueFoundry `Job`.
- Provider secrets map cleanly to TrueFoundry `SecretGroup`.

## Needs Adaptation

- Codex does not expose a stable HTTP deployment API from the CLI package.
- `codex mcp-server` is a stdio server, so TrueFoundry's remote MCP registration needs an HTTP/SSE bridge first.
- Persistent workspace mounts should be single-writer unless the volume backend explicitly supports multiple writers.

## Risk

This is a powerful coding agent. Default to scoped workspace contents, limited secrets, and a non-privileged image. Do not use `danger-full-access` as the starter template.
