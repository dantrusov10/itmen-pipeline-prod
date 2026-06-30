#!/usr/bin/env python3
"""One-time: записать Amo токены и секрет в .env на сервере."""
import json
import os
import re

TOKEN_PATH = "/opt/itmen-pipeline/amo-tokens.json"
ENV_PATH = "/opt/itmen-pipeline/.env"

ACCESS_TOKEN = os.environ.get("AMO_SETUP_ACCESS_TOKEN", "")
REFRESH_TOKEN = os.environ.get("AMO_SETUP_REFRESH_TOKEN", ACCESS_TOKEN)
CLIENT_SECRET = os.environ.get("AMO_SETUP_CLIENT_SECRET", "")
CLIENT_ID = os.environ.get("AMO_CLIENT_ID", "f4ae4a8e-f973-406a-906a-fc3e29d4a2d9")

def upsert_env(key, value):
    lines = []
    if os.path.isfile(ENV_PATH):
        lines = open(ENV_PATH, encoding="utf-8").read().splitlines()
    out = []
    found = False
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    open(ENV_PATH, "w", encoding="utf-8").write("\n".join(out) + "\n")

def main():
    if not ACCESS_TOKEN or not CLIENT_SECRET:
        raise SystemExit("AMO_SETUP_ACCESS_TOKEN and AMO_SETUP_CLIENT_SECRET required")
    data = {
        "access_token": ACCESS_TOKEN,
        "refresh_token": REFRESH_TOKEN,
        "token_type": "Bearer",
        "expires_in": 157766400,
        "saved_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    json.dump(data, open(TOKEN_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    upsert_env("AMO_CLIENT_SECRET", CLIENT_SECRET)
    upsert_env("AMO_CLIENT_ID", CLIENT_ID)
    upsert_env("AMO_SUBDOMAIN", "inferit")
    print("ok", TOKEN_PATH)

if __name__ == "__main__":
    main()
