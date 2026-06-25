#!/usr/bin/env python3
import json, urllib.request, urllib.error

def load_pw(p):
    for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
        if line.startswith(p):
            return line.split("=", 1)[1].strip()

def req(url, data=None, token=None, method=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    b = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(url, data=b, headers=h, method=method)
    with urllib.request.urlopen(r, timeout=30) as res:
        return res.status, json.loads(res.read())

tok = req("http://127.0.0.1:3010/api/auth/login", {
    "email": "admin@itmen-pipeline.local",
    "password": load_pw("admin@"),
})[1]["token"]
print("health", req("http://127.0.0.1:3010/api/health")[1])
_, crm = req("http://127.0.0.1:3010/api/deals/D-001/crm", token=tok)
print("crm keys", list(crm.keys()))
_, cal = req("http://127.0.0.1:3010/api/calendar/tasks?mine=1", token=tok)
print("calendar tasks", len(cal.get("items", [])))
_, sr = req("http://127.0.0.1:3010/api/search?q=test", token=tok)
print("search keys", list(sr.keys()))
_, prof = req("http://127.0.0.1:3010/api/profile", token=tok)
print("profile", prof.get("profile", {}).get("email"))
print("OK")
