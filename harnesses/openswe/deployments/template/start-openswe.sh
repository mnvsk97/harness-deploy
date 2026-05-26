#!/usr/bin/env bash
set -euo pipefail

rm -rf /workspace/open-swe
git clone https://github.com/langchain-ai/open-swe /workspace/open-swe
cd /workspace/open-swe
git checkout "${OPEN_SWE_REF}"

python - <<'PY'
import os
from pathlib import Path

model_id = os.environ.get("OPENSWE_OPENAI_MODEL_ID", "openai:gpt-5.5")

model_path = Path("agent/utils/model.py")
model_text = model_path.read_text()
if "import os\n" not in model_text.split("\n", 4)[:4]:
    model_text = model_text.replace("from typing import Literal, TypedDict, Unpack\n", "import os\nfrom typing import Literal, TypedDict, Unpack\n", 1)
model_text = model_text.replace(
    'OPENAI_RESPONSES_WS_BASE_URL = "wss://api.openai.com/v1"',
    'OPENAI_RESPONSES_WS_BASE_URL = os.environ.get("OPENAI_BASE_URL", "wss://api.openai.com/v1")',
)
model_text = model_text.replace(
    '        model_kwargs["use_responses_api"] = True',
    '        if os.environ.get("OPENSWE_OPENAI_USE_RESPONSES_API", "0") == "1":\n'
    '            model_kwargs["use_responses_api"] = True',
)
model_text = model_text.replace(
    '    if primary_model_id.startswith("openai:"):\n        return "anthropic:claude-opus-4-5"',
    '    if primary_model_id.startswith("openai:"):\n        return os.environ.get("LLM_FALLBACK_MODEL_ID")',
)
model_path.write_text(model_text)

options_path = Path("agent/dashboard/options.py")
options_text = options_path.read_text()
options_text = options_text.replace('"id": "openai:gpt-5.5"', f'"id": "{model_id}"')
options_text = options_text.replace('DEFAULT_MODEL_ID: str = "openai:gpt-5.5"', f'DEFAULT_MODEL_ID: str = "{model_id}"')
options_path.write_text(options_text)

server_path = Path("agent/server.py")
server_text = server_path.read_text()
server_text = server_text.replace(
    "    github_token, new_encrypted, new_expires_at = await resolve_github_token(config, thread_id)\n"
    '    config["metadata"]["github_token_encrypted"] = new_encrypted\n'
    '    config["metadata"]["github_token_expires_at"] = new_expires_at\n'
    "    triggering_user_identity = await asyncio.to_thread(\n"
    "        resolve_triggering_user_identity, config, github_token\n"
    "    )\n"
    "    del github_token\n",
    "    if os.environ.get(\"OPENSWE_DISABLE_REPO_AUTH\", \"1\") == \"1\":\n"
    "        github_token = None\n"
    "        triggering_user_identity = resolve_triggering_user_identity(config, None)\n"
    "    else:\n"
    "        github_token, new_encrypted, new_expires_at = await resolve_github_token(config, thread_id)\n"
    '        config["metadata"]["github_token_encrypted"] = new_encrypted\n'
    '        config["metadata"]["github_token_expires_at"] = new_expires_at\n'
    "        triggering_user_identity = await asyncio.to_thread(\n"
    "            resolve_triggering_user_identity, config, github_token\n"
    "        )\n"
    "        del github_token\n",
)
server_path.write_text(server_text)

oauth_path = Path("agent/dashboard/oauth.py")
oauth_text = oauth_path.read_text()
oauth_text = oauth_text.replace(
    "def require_session(request: Request) -> dict[str, Any]:\n"
    "    token = request.cookies.get(COOKIE_NAME)\n"
    "    if not token:\n"
    "        raise HTTPException(401, \"not authenticated\")\n"
    "    return decode_session(token)\n",
    "def require_session(request: Request) -> dict[str, Any]:\n"
    "    service_token = os.environ.get(\"OPENSWE_DASHBOARD_AUTH_TOKEN\", \"\")\n"
    "    auth_header = request.headers.get(\"authorization\", \"\")\n"
    "    if service_token and auth_header == f\"Bearer {service_token}\":\n"
    "        return {\n"
    "            \"sub\": os.environ.get(\"OPENSWE_DASHBOARD_SERVICE_USER\", \"slack\"),\n"
    "            \"email\": os.environ.get(\"OPENSWE_DASHBOARD_SERVICE_EMAIL\", \"slack@truefoundry.local\"),\n"
    "            \"avatar_url\": None,\n"
    "        }\n"
    "    token = request.cookies.get(COOKIE_NAME)\n"
    "    if not token:\n"
    "        raise HTTPException(401, \"not authenticated\")\n"
    "    return decode_session(token)\n",
)
oauth_path.write_text(oauth_text)

thread_api_path = Path("agent/dashboard/thread_api.py")
thread_api_text = thread_api_path.read_text()
thread_api_text = thread_api_text.replace(
    "async def _persist_dashboard_github_token(thread_id: str, login: str) -> None:\n"
    "    token = await get_valid_access_token(login)\n",
    "async def _persist_dashboard_github_token(thread_id: str, login: str) -> None:\n"
    "    if os.environ.get(\"OPENSWE_DISABLE_REPO_AUTH\", \"1\") == \"1\":\n"
    "        return\n"
    "    token = await get_valid_access_token(login)\n",
)
thread_api_text = thread_api_text.replace(
    "    if profile_repo:\n"
    "        return profile_repo\n",
    "    if profile_repo:\n"
    "        return profile_repo\n"
    "    env_repo = _parse_repo(os.environ.get(\"OPENSWE_DEFAULT_REPO\"))\n"
    "    if env_repo:\n"
    "        return env_repo\n",
)
thread_api_path.write_text(thread_api_text)
PY

exec /root/.local/bin/uv run langgraph dev --host 0.0.0.0 --port 2024 --no-browser
