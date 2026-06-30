#!/usr/bin/env python3
"""Append Kaiten env vars to /opt/itmen-pipeline/.env if missing."""
from __future__ import annotations
import os

ENV_PATH = "/opt/itmen-pipeline/.env"
DEFAULTS = {
    "KAITEN_API_URL": "https://inferitsoft.kaiten.ru/api/latest",
    "KAITEN_SPACE_ID": "612368",
    "KAITEN_BOARD_ID": "1391605",
    "KAITEN_CARD_URL_TEMPLATE": "https://inferitsoft.kaiten.ru/space/612368/card/{id}",
    "ITMEN_PUBLIC_URL": "https://itmen-pipeline.nwlvl.ru",
}


def main():
    lines = []
    if os.path.exists(ENV_PATH):
        lines = open(ENV_PATH, encoding="utf-8").read().splitlines()
    existing = {line.split("=", 1)[0] for line in lines if "=" in line and not line.strip().startswith("#")}
    added = []
    for key, val in DEFAULTS.items():
        if key not in existing:
            lines.append(f"{key}={val}")
            added.append(key)
    if added:
        open(ENV_PATH, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        print("added:", ", ".join(added))
    else:
        print("all defaults present")
    if "KAITEN_API_TOKEN" not in existing:
        print("WARN: set KAITEN_API_TOKEN manually in .env")


if __name__ == "__main__":
    main()
