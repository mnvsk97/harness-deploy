# Cursor Agent SDK Compatibility Notes

## Direct Fit

- Cursor self-hosted workers map well to a TrueFoundry `Service`.
- No inbound WebSocket/public service is required for the default worker flow.

## Needs Adaptation

- Cursor remains the control plane. TrueFoundry hosts workers, not the whole Cursor Cloud Agent product.
- Worker images need outbound internet access to Cursor and source repositories.
- Workspace persistence depends on whether each worker should be disposable or sticky.

## Risk

This is not a standalone agent PaaS. It is a worker-pool integration for Cursor-managed tasks.
