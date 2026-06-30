#!/usr/bin/env python3
"""Remove duplicate Amo-imported tasks (keep first per deal+title+status+due date)."""
import json
import os
import urllib.parse
import urllib.request

PB = "http://127.0.0.1:8095"


def load_env():
    email = password = ""
    for line in open("/opt/itmen-pipeline/.env"):
        if line.startswith("PB_ADMIN_EMAIL="):
            email = line.split("=", 1)[1].strip()
        if line.startswith("PB_ADMIN_PASSWORD="):
            password = line.split("=", 1)[1].strip()
    return email, password


def pb_list(token, collection):
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({"page": page, "perPage": 200})
        data = json.loads(urllib.request.urlopen(
            urllib.request.Request(f"{PB}/api/collections/{collection}/records?{q}",
                                   headers={"Authorization": token})).read())
        items.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    return items


def main():
    email, password = load_env()
    token = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{PB}/api/admins/auth-with-password",
        json.dumps({"identity": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"})).read())["token"]

    tasks = pb_list(token, "deal_tasks")
    amo = [t for t in tasks if (t.get("created_by") or "") == "Amo import"]
    seen = {}
    deleted = 0
    for t in amo:
        due = (t.get("due_at") or t.get("done_at") or "")[:10]
        key = (t["deal"], t.get("title") or "", t.get("status") or "", due)
        if key in seen:
            req = urllib.request.Request(
                f"{PB}/api/collections/deal_tasks/records/{t['id']}",
                headers={"Authorization": token}, method="DELETE")
            urllib.request.urlopen(req)
            deleted += 1
        else:
            seen[key] = t["id"]
    print(json.dumps({"amo_tasks_total": len(amo), "unique": len(seen), "deleted": deleted}, ensure_ascii=False))


if __name__ == "__main__":
    main()
