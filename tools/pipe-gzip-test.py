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
req = urllib.request.Request(
    "http://127.0.0.1:3010/api/pipeline?lite=1",
    headers={"Authorization": f"Bearer {token}", "Accept-Encoding": "gzip"},
)
with urllib.request.urlopen(req) as r:
  enc = r.headers.get("Content-Encoding", "")
  body = r.read()
  print("encoding", enc, "wire_bytes", len(body))
  if enc == "gzip":
    import gzip
    body = gzip.decompress(body)
  data = json.loads(body)
  print("json_bytes", len(body), "deals", len(data["state"]["deals"]))
