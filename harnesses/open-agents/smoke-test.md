# Open Agents Smoke Test

1. Apply the secret group.
2. Deploy the web service.
3. Call `/` and confirm the Next.js app renders.
4. Visit `/api/auth/sign-in` or the configured auth route and confirm callbacks
   use the TrueFoundry domain.
5. Sign in with Vercel OAuth.
6. Connect GitHub and confirm repo listing works.
7. Create a tiny session against a public repo.
8. Confirm sandbox provisioning either succeeds with Vercel Sandbox or fails
   with a clear missing-provider/config error.
9. If Slack bridge mode is enabled, send a DM and confirm it reaches the target
   Open Agents endpoint.
