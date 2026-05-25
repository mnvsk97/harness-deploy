#!/usr/bin/env bash
set -euo pipefail

base_url="${HERMES_API_URL:-https://${HERMES_API_HOST:-}}"
token="${HERMES_API_TOKEN:-}"

if [[ -z "$base_url" || "$base_url" == "https://" ]]; then
  echo "Set HERMES_API_URL or HERMES_API_HOST." >&2
  exit 2
fi

if [[ -z "$token" ]]; then
  echo "Set HERMES_API_TOKEN to the Hermes API bearer token." >&2
  exit 2
fi

health_code="$(curl -sS -o /tmp/hermes-health.json -w '%{http_code}' "${base_url%/}/health")"
[[ "$health_code" == "200" ]] || { cat /tmp/hermes-health.json >&2; exit 1; }

models_code="$(curl -sS -o /tmp/hermes-models.json -w '%{http_code}' \
  -H "authorization: Bearer ${token}" \
  "${base_url%/}/v1/models")"
[[ "$models_code" == "200" ]] || { cat /tmp/hermes-models.json >&2; exit 1; }

chat_code="$(curl -sS -o /tmp/hermes-chat.json -w '%{http_code}' \
  -H "authorization: Bearer ${token}" \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is 2+21? Reply with only the number."}],"temperature":0,"max_tokens":20,"stream":false}' \
  "${base_url%/}/v1/chat/completions")"
[[ "$chat_code" == "200" ]] || { cat /tmp/hermes-chat.json >&2; exit 1; }

python3 - <<'PY'
import json
with open("/tmp/hermes-chat.json") as f:
    data = json.load(f)
content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()
if content != "23":
    raise SystemExit(f"unexpected chat response: {content!r}")
print("Hermes smoke test passed: health=200 models=200 chat=23")
PY
