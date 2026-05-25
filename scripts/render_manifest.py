#!/usr/bin/env python3
"""Render a manifest template using root .env values."""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path


VAR_PATTERN = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def render(source: str, values: dict[str, str]) -> str:
    missing: set[str] = set()

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in values:
            return values[key]
        missing.add(key)
        return match.group(0)

    rendered = VAR_PATTERN.sub(replace, source)
    if missing:
        names = ", ".join(sorted(missing))
        raise SystemExit(f"Missing required env values: {names}")
    return rendered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--out", type=Path, help="Output path. Defaults to stdout.")
    args = parser.parse_args()

    values = {**load_env(args.env_file), **os.environ}
    result = render(args.manifest.read_text(), values)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(result)
    else:
        print(result, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
