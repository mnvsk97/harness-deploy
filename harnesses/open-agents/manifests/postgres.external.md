# Open Agents Postgres Requirement

Open Agents requires `POSTGRES_URL`. The app runs migrations during
`apps/web` build via `lib/db/migrate.ts`.

For TrueFoundry, use one of:

- managed Postgres outside TrueFoundry,
- an existing internal Postgres reachable from the cluster,
- a separately deployed Postgres service for demos only.

Store the connection string in:

```yaml
POSTGRES_URL: tfy-secret://WORKSPACE_OR_USER:open-agents-secrets:POSTGRES_URL
```

Do not put the raw connection string in service manifests.
