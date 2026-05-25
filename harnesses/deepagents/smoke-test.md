# DeepAgents Smoke Test

1. Apply the secret group and job manifest.
2. Confirm the job image builds and starts.
3. Confirm package import succeeds.
4. If running a real prompt, confirm the provider key is accepted.
5. For a service wrapper, call `/healthz`, then run a tiny `/invoke` request with a read-only task.

Expected first success signal: the job completes after importing DeepAgents and printing package/runtime information.
