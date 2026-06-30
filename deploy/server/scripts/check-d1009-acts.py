#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request

token = json.load(urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:8095/api/admins/auth-with-password",
    data=json.dumps({
        "identity": open("/opt/itmen-pipeline/.env").read().split("PB_ADMIN_EMAIL=")[1].split("\n")[0].strip().strip('"'),
        "password": open("/opt/itmen-pipeline/.env").read().split("PB_ADMIN_PASSWORD=")[1].split("\n")[0].strip().strip('"'),
    }).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)))["token"]

headers = {"Authorization": token}
pb = "tpuqyx3yqrfg483"
af = urllib.parse.quote(f'deal="{pb}"')
acts = json.load(urllib.request.urlopen(urllib.request.Request(
    f"http://127.0.0.1:8095/api/collections/deal_activities/records?perPage=20&filter={af}",
    headers=headers,
)))["items"]
for a in acts:
    print(a.get("id"), a.get("activity_type"), repr(a.get("author")), a.get("deal"), (a.get("body") or "")[:50])
