#!/usr/bin/env python3
import json
import urllib.request

password = None
for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
    if line.startswith("admin@"):
        password = line.strip().split("=", 1)[1]
        break

login = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(
            "http://127.0.0.1:3010/api/auth/login",
            data=json.dumps({"email": "admin@itmen-pipeline.local", "password": password}).encode(),
            headers={"Content-Type": "application/json"},
        )
    ).read()
)
token = login["token"]
for label, url in [("lite", "/api/pipeline?lite=1"), ("full", "/api/pipeline")]:
    body = urllib.request.urlopen(
        urllib.request.Request(
            f"http://127.0.0.1:3010{url}",
            headers={"Authorization": f"Bearer {token}"},
        )
    ).read()
    data = json.loads(body)
    print(label, "bytes", len(body), "deals", len(data["state"]["deals"]))
