#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request


def load_env():
    d = {}
    for line in open("/opt/itmen-pipeline/.env", encoding="utf-8"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            d[k] = v.strip().strip('"')
    return d


def main():
    env = load_env()
    req = urllib.request.Request(
        "http://127.0.0.1:8095/api/admins/auth-with-password",
        data=json.dumps({"identity": env["PB_ADMIN_EMAIL"], "password": env["PB_ADMIN_PASSWORD"]}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.load(urllib.request.urlopen(req))["token"]
    headers = {"Authorization": token}
    filt = urllib.parse.quote('email="admin@itmen-pipeline.local"')
    url = f"http://127.0.0.1:8095/api/collections/pipeline_users/records?perPage=1&filter={filt}"
    rec = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers)))["items"][0]
    name = "Трусов Данила"
    if rec.get("manager_name") == name and rec.get("display_name") == name:
        print("already clean")
        return
    body = json.dumps({"manager_name": name, "display_name": name}).encode()
    urllib.request.urlopen(urllib.request.Request(
        f"http://127.0.0.1:8095/api/collections/pipeline_users/records/{rec['id']}",
        data=body,
        headers={**headers, "Content-Type": "application/json"},
        method="PATCH",
    ))
    print("fixed admin manager_name")


if __name__ == "__main__":
    main()
