#!/usr/bin/env python3
import json
import sys
import urllib.parse
import urllib.request

DEAL_ID = sys.argv[1] if len(sys.argv) > 1 else "D-1009"


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
    base = "http://127.0.0.1:8095"
    req = urllib.request.Request(
        f"{base}/api/admins/auth-with-password",
        data=json.dumps({
            "identity": env["PB_ADMIN_EMAIL"],
            "password": env["PB_ADMIN_PASSWORD"],
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.load(urllib.request.urlopen(req))["token"]
    headers = {"Authorization": token}

    filt = urllib.parse.quote(f'deal_id="{DEAL_ID}"')
    deal = json.load(urllib.request.urlopen(
        urllib.request.Request(
            f"{base}/api/collections/deals/records?perPage=1&filter={filt}&fields=deal_id,amo_id,id,stage",
            headers=headers,
        )
    ))["items"]
    print("deal:", deal)
    if not deal:
        return
    pb = deal[0]["id"]
    af = urllib.parse.quote(f'deal="{pb}"')
    acts = json.load(urllib.request.urlopen(
        urllib.request.Request(
            f"{base}/api/collections/deal_activities/records?perPage=10&filter={af}&sort=-activity_at",
            headers=headers,
        )
    ))["items"]
    tasks = json.load(urllib.request.urlopen(
        urllib.request.Request(
            f"{base}/api/collections/deal_tasks/records?perPage=10&filter={af}&sort=-created",
            headers=headers,
        )
    ))["items"]
    print("activities:", len(acts))
    for a in acts[:3]:
        print(" -", a.get("activity_type"), (a.get("body") or "")[:80])
    print("tasks:", len(tasks))
    for t in tasks[:3]:
        print(" -", t.get("status"), t.get("title"), t.get("due_at"))


if __name__ == "__main__":
    main()
