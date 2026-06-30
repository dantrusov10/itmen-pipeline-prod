#!/usr/bin/env python3
"""Откат D-015: очистить ложные поля, оставить владельца Александр Сироткин."""
import json
import urllib.request

password = None
for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
    if line.startswith("admin@"):
        password = line.strip().split("=", 1)[1]
        break

login = json.loads(urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:3010/api/auth/login",
    data=json.dumps({"email": "admin@itmen-pipeline.local", "password": password}).encode(),
    headers={"Content-Type": "application/json"},
)).read())

token = login["token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

deal = json.loads(urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:3010/api/pipeline/deals/D-015", headers=headers,
)).read())["deal"]

deal["owner"] = "Александр Сироткин"
deal["budgetStatus"] = ""
deal["budgetPeriod"] = ""
deal["commitStatus"] = ""
deal["scores"] = {}
deal["scoreReasons"] = {}
deal["scoresOverridden"] = {}

req = urllib.request.Request(
    "http://127.0.0.1:3010/api/deals/D-015",
    data=json.dumps({"deal": deal}).encode(),
    headers=headers,
    method="PATCH",
)
res = json.loads(urllib.request.urlopen(req).read())
print("ok", res.get("ok"), "owner", res.get("deal", {}).get("owner"))
print("budgetStatus", repr(res.get("deal", {}).get("budgetStatus")))
print("auditRows", res.get("auditRows"))
