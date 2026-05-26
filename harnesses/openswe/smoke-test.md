# Open SWE Smoke Test

1. Apply `manifests/secret-group.example.yaml` after replacing placeholders.
2. Deploy `manifests/service-source-build.template.yaml`.
3. Confirm `GET /health` returns success.
4. Send a message through the LangGraph run API.
5. Confirm the run returns an assistant response.
6. Confirm a thread state read includes the message history.
