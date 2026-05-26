import os
import re
import threading
from typing import Optional

from daytona import Daytona, CreateSandboxFromSnapshotParams, DaytonaConfig
from mcp.server.fastmcp import FastMCP


mcp = FastMCP("goose-daytona")
_lock = threading.Lock()
_sandbox = None


def _session_name() -> str:
    raw = os.environ.get("AGENT_SESSION_ID") or "default"
    safe = re.sub(r"[^a-zA-Z0-9-]+", "-", raw).strip("-").lower()
    return f"goose-{safe or 'default'}"[:63]


def _client() -> Daytona:
    config = DaytonaConfig(
        api_key=os.environ.get("DAYTONA_API_KEY"),
        api_url=os.environ.get("DAYTONA_API_URL") or None,
        target=os.environ.get("DAYTONA_TARGET") or None,
        otel_enabled=False,
    )
    return Daytona(config)


def _sandbox_info(sandbox) -> str:
    sandbox_id = getattr(sandbox, "id", "")
    name = getattr(sandbox, "name", "")
    state = getattr(sandbox, "state", "")
    return f"id={sandbox_id} name={name} state={state}"


def _get_or_create_sandbox():
    global _sandbox
    with _lock:
        if _sandbox is not None:
            return _sandbox

        name = _session_name()
        client = _client()
        try:
            _sandbox = client.get(name)
        except Exception:
            params = CreateSandboxFromSnapshotParams(
                name=name,
                language="python",
                labels={
                    "managed-by": "harness-deploy",
                    "harness": "goose",
                    "goose-session": os.environ.get("AGENT_SESSION_ID", "default"),
                },
                auto_stop_interval=30,
                auto_archive_interval=0,
            )
            _sandbox = client.create(params, timeout=90)
        return _sandbox


@mcp.tool()
def daytona_sandbox_info() -> str:
    """Create or reconnect to the Daytona sandbox for this Goose session and return its id, name, and state."""
    sandbox = _get_or_create_sandbox()
    return _sandbox_info(sandbox)


@mcp.tool()
def daytona_exec(command: str, cwd: Optional[str] = None, timeout: int = 60) -> str:
    """Run a shell command inside this Goose session's Daytona sandbox."""
    sandbox = _get_or_create_sandbox()
    response = sandbox.process.exec(command, cwd=cwd, timeout=timeout)
    result = response.result or ""
    exit_code = response.exit_code
    return f"exit_code={exit_code}\n{result}"


@mcp.tool()
def daytona_write_file(path: str, content: str) -> str:
    """Write text content to a file inside the Daytona sandbox."""
    sandbox = _get_or_create_sandbox()
    escaped_path = path.replace("'", "'\"'\"'")
    escaped_content = content.replace("'", "'\"'\"'")
    response = sandbox.process.exec(
        f"mkdir -p \"$(dirname '{escaped_path}')\" && cat > '{escaped_path}' <<'EOF'\n{escaped_content}\nEOF"
    )
    if response.exit_code not in (0, None):
        return f"exit_code={response.exit_code}\n{response.result or ''}"
    return f"wrote {path}"


@mcp.tool()
def daytona_read_file(path: str, max_bytes: int = 20000) -> str:
    """Read a text file from the Daytona sandbox."""
    sandbox = _get_or_create_sandbox()
    escaped_path = path.replace("'", "'\"'\"'")
    response = sandbox.process.exec(f"head -c {int(max_bytes)} '{escaped_path}'")
    return f"exit_code={response.exit_code}\n{response.result or ''}"


if __name__ == "__main__":
    mcp.run()
