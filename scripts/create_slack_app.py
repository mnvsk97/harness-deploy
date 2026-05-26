#!/usr/bin/env python3
"""Create a Slack app from a rendered app manifest."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


SLACK_CREATE_URL = "https://slack.com/api/apps.manifest.create"


def post_json(url: str, token: str, payload: dict[str, object]) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json; charset=utf-8",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8")
        raise SystemExit(f"Slack API HTTP {exc.code}: {response_body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Slack API request failed: {exc.reason}") from exc

    try:
        result = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Slack API returned non-JSON response: {response_body}") from exc

    if not result.get("ok"):
        message = result.get("error", "unknown_error")
        errors = result.get("errors")
        if errors:
            message = f"{message}: {json.dumps(errors, indent=2)}"
        raise SystemExit(f"Slack app creation failed: {message}")

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Rendered Slack app manifest JSON.")
    parser.add_argument("--token", required=True, help="Slack app configuration access token.")
    parser.add_argument("--team-id", help="Workspace team ID when using an org token.")
    parser.add_argument("--out", type=Path, help="Write full Slack API response JSON here.")
    args = parser.parse_args()

    manifest_text = args.manifest.read_text()
    manifest = json.loads(manifest_text)
    if "${" in manifest_text:
        raise SystemExit("Manifest still contains placeholders. Render it before creating the Slack app.")

    payload: dict[str, object] = {"manifest": json.dumps(manifest)}
    if args.team_id:
        payload["team_id"] = args.team_id

    result = post_json(SLACK_CREATE_URL, args.token, payload)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n")

    credentials = result.get("credentials") or {}
    if not isinstance(credentials, dict):
        credentials = {}

    print(f"app_id={result.get('app_id', '')}")
    print(f"signing_secret={credentials.get('signing_secret', '')}")
    print(f"oauth_authorize_url={result.get('oauth_authorize_url', '')}")
    print()
    print("Next: open oauth_authorize_url, approve the app, then copy the bot token into the harness Slack SecretGroup.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        sys.exit(130)
