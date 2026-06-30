#!/usr/bin/env python3
import json
import sys
import urllib.request

DEAL_ID = sys.argv[1] if len(sys.argv) > 1 else "D-1009"
API = "http://127.0.0.1:3010"


def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    return env


def main():
    env = load_env("/opt/itmen-pipeline/.env")
    login = urllib.request.Request(
        f"{API}/api/auth/login",
        data=json.dumps({
            "email": env.get("ADMIN_EMAIL") or env.get("PB_ADMIN_EMAIL"),
            "password": env.get("ADMIN_PASSWORD") or env.get("PB_ADMIN_PASSWORD"),
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    session = json.load(urllib.request.urlopen(login))
    token = session.get("token") or session.get("accessToken")
    if not token and session.get("user"):
        token = session.get("token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = urllib.request.Request(
        f"{API}/api/deals/{DEAL_ID}/amo-resync",
        data=b"{}",
        headers=headers,
        method="POST",
    )
    print(json.dumps(json.load(urllib.request.urlopen(req)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
