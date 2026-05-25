# Cursor Agent SDK Smoke Test

1. Apply the secret group.
2. Apply the worker service with one replica.
3. Confirm the pod starts and connects outbound to Cursor.
4. Confirm the worker appears in the configured Cursor worker pool.
5. Dispatch a tiny agent task from Cursor and confirm logs show checkout/start/finish.
