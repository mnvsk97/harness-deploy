# Open SWE Smoke Test

1. Apply `manifests/secret-group.example.yaml` after replacing placeholders.
2. Deploy `manifests/service-source-build.template.yaml`.
3. Confirm `GET /health` returns success.
4. Configure one trigger surface:
   - GitHub issue or PR comment containing `@openswe`
   - Linear issue comment containing `@openswe`
   - Slack thread mention
5. Confirm the service acknowledges the trigger.
6. Confirm a run appears in the configured tracing/runtime backend.
7. Confirm Open SWE posts a result back to the source channel.

