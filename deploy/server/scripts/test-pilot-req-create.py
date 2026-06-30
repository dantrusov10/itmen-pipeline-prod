#!/usr/bin/env python3
import json, os, urllib.request

pb = "http://127.0.0.1:8095"
email = password = ""
for line in open("/opt/itmen-pipeline/.env"):
    if line.startswith("PB_ADMIN_EMAIL="):
        email = line.split("=", 1)[1].strip()
    if line.startswith("PB_ADMIN_PASSWORD="):
        password = line.split("=", 1)[1].strip()

def http(url, data=None, token=None, method=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = token
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.read().decode()
    except urllib.error.HTTPError as e:
        print("ERR", e.code, e.read().decode())
        raise

token = json.loads(http(f"{pb}/api/admins/auth-with-password", {"identity": email, "password": password}))["token"]
deals = json.loads(http(f"{pb}/api/collections/deals/records?perPage=1", token=token))
did = deals["items"][0]["id"]
print("deal", did)
body = {
    "deal": did,
    "sort_order": 0,
    "client_requirement": "test req",
    "req_type": "Тех",
    "is_mandatory": True,
    "feasibility": "Полностью",
    "feasibility_score": 1.0,
    "source": "test",
}
print(http(f"{pb}/api/collections/pilot_requirements/records", body, token=token, method="POST"))
