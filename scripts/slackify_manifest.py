#!/usr/bin/env python3
"""Inject a standard Slack Socket Mode env block into a TrueFoundry manifest.

This is intentionally text-based and dependency-free so it works on laptops and
CI runners without PyYAML. It targets the simple manifest shape used in this
repo: top-level `env:` as a mapping, with two-space indented keys.
"""

from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_KEYS = {
    "SLACK_SOCKET_MODE": '"true"',
    "SLACK_BOT_TOKEN": None,
    "SLACK_APP_TOKEN": None,
    "SLACK_SIGNING_SECRET": None,
    "SLACK_ALLOWED_USERS": None,
    "SLACK_ALLOWED_CHANNELS": None,
    "SLACK_REQUIRE_MENTION": '"true"',
    "SLACK_STRICT_MENTION": '"true"',
    "SLACK_FREE_RESPONSE_CHANNELS": '""',
    "SLACK_HOME_CHANNEL": '""',
    "SLACK_HOME_CHANNEL_NAME": '""',
}


def secret_ref(tenant: str, group: str, key: str) -> str:
    return f'"tfy-secret://{tenant}:{group}:{key}"'


def build_env_block(tenant: str, group: str) -> list[str]:
    lines: list[str] = []
    for key, value in DEFAULT_KEYS.items():
        if value is None:
            value = secret_ref(tenant, group, key)
        lines.append(f"  {key}: {value}")
    return lines


def find_env_bounds(lines: list[str]) -> tuple[int | None, int | None]:
    start = None
    for idx, line in enumerate(lines):
        if line.strip() == "env:" and not line.startswith(" "):
            start = idx
            break
    if start is None:
        return None, None

    end = len(lines)
    for idx in range(start + 1, len(lines)):
        line = lines[idx]
        if line and not line.startswith(" ") and not line.startswith("#"):
            end = idx
            break
    return start, end


def inject_slack_env(source: str, tenant: str, group: str) -> str:
    lines = source.splitlines()
    env_start, env_end = find_env_bounds(lines)
    block = build_env_block(tenant, group)

    if env_start is None:
        insert_at = len(lines)
        for idx, line in enumerate(lines):
            if line.startswith(("ports:", "replicas:", "liveness_probe:", "readiness_probe:")):
                insert_at = idx
                break
        lines[insert_at:insert_at] = ["env:", *block]
        return "\n".join(lines) + "\n"

    existing_keys = {
        line.split(":", 1)[0].strip()
        for line in lines[env_start + 1 : env_end]
        if line.startswith("  ") and ":" in line
    }
    additions = [line for line in block if line.split(":", 1)[0].strip() not in existing_keys]
    if additions:
        lines[env_end:env_end] = additions
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, help="Output path. Defaults to stdout.")
    parser.add_argument("--secret-tenant", default="YOUR_USER_OR_TEAM")
    parser.add_argument("--secret-group", default="slack-secrets")
    args = parser.parse_args()

    result = inject_slack_env(
        args.manifest.read_text(),
        tenant=args.secret_tenant,
        group=args.secret_group,
    )
    if args.out:
        args.out.write_text(result)
    else:
        print(result, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
