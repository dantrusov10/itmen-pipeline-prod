#!/usr/bin/env python3
"""Добавить стадии/владельцев/причины отказа для пре-сейла в list_items."""
import json
import urllib.parse
import urllib.request


def load_env(path):
    d = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k.strip()] = v.strip().strip('"')
    return d


def main():
    env = load_env("/opt/itmen-pipeline/.env")
    email = env.get("PB_ADMIN_EMAIL", "")
    password = env.get("PB_ADMIN_PASSWORD", "")
    base = "http://127.0.0.1:8095"

    req = urllib.request.Request(
        f"{base}/api/admins/auth-with-password",
        data=json.dumps({"identity": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.load(urllib.request.urlopen(req))["token"]
    headers = {"Authorization": token, "Content-Type": "application/json"}

    def pb(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(r) as resp:
            return json.load(resp)

    def ensure(list_key, label):
        filt = urllib.parse.quote(f'list_key="{list_key}"')
        items = pb("GET", f"/api/collections/list_items/records?perPage=500&filter={filt}")["items"]
        values = [i.get("value") for i in items]
        if label in values:
            print(f"exists {list_key}: {label}")
            return
        max_order = max([int(i.get("sort_order") or 0) for i in items] + [0])
        pb("POST", "/api/collections/list_items/records", {
            "list_key": list_key,
            "value": label,
            "sort_order": max_order + 1,
            "active": True,
        })
        print(f"added {list_key}: {label}")

    ensure("stages", "Ожидаем отчет по итогам")
    ensure("owners", "Гадиров Гадир")
    ensure("owners", "Иван Лашин")
    ensure("loss_reasons", "Провал после демо (функциональный)")


if __name__ == "__main__":
    main()
