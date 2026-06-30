#!/usr/bin/env python3
import json
import urllib.request

def load_env():
    env = {}
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    return env

def main():
    env = load_env()
    login = urllib.request.Request(
        "http://127.0.0.1:3010/api/auth/login",
        data=json.dumps({
            "email": env.get("ADMIN_EMAIL", env["PB_ADMIN_EMAIL"]),
            "password": env.get("ADMIN_PASSWORD", env["PB_ADMIN_PASSWORD"]),
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    sess = json.load(urllib.request.urlopen(login))
    token = sess.get("token") or sess.get("accessToken")
    headers = {"Authorization": f"Bearer {token}"}

    for path in ["/api/pipeline?lite=1", "/api/reports/task-metrics?period=month"]:
        req = urllib.request.Request(f"http://127.0.0.1:3010{path}", headers=headers)
        try:
            data = json.load(urllib.request.urlopen(req, timeout=120))
            if "state" in data:
                print(path, "deals", len(data["state"].get("deals") or []))
            else:
                print(path, "ok", data.get("ok"), "tasks", data.get("summary", {}).get("taskCount"))
        except Exception as e:
            print(path, "FAIL", e)

if __name__ == "__main__":
    main()
