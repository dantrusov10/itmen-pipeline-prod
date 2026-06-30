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

    filt = urllib.parse.quote('list_key="presale_owners"')
    url = f"http://127.0.0.1:8095/api/collections/list_items/records?perPage=500&filter={filt}"
    items = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers)))["items"]
    vals = sorted(i["value"] for i in items)
    print("presale_owners:", vals)
    if "Трусов Данила" in vals:
        print("exists: Трусов Данила")
        return
    max_order = max([int(i.get("sort_order") or 0) for i in items] + [0])
    body = json.dumps({
        "list_key": "presale_owners",
        "value": "Трусов Данила",
        "sort_order": max_order + 1,
        "active": True,
    }).encode()
    urllib.request.urlopen(urllib.request.Request(
        "http://127.0.0.1:8095/api/collections/list_items/records",
        data=body,
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    ))
    print("added: Трусов Данила")


if __name__ == "__main__":
    main()
