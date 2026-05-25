# Open Agents Redis/KV Requirement

Redis/KV is optional in the inspected repo. `apps/web/lib/redis.ts` falls back
or disables some cache-backed behavior when `REDIS_URL` / `KV_URL` are not set.

For production, provide one of:

```yaml
REDIS_URL: tfy-secret://WORKSPACE_OR_USER:open-agents-secrets:REDIS_URL
KV_URL: tfy-secret://WORKSPACE_OR_USER:open-agents-secrets:KV_URL
```

Use a managed Redis compatible endpoint if possible.
