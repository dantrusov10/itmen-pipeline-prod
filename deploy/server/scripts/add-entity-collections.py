#!/usr/bin/env python3
"""Добавить коллекции crm_companies / crm_contacts и справочник distributors."""
import json
import urllib.parse
import urllib.request

PB = "http://127.0.0.1:8095"


def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    return env


def pb(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{PB}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def coll_exists(name, token):
    try:
        pb("GET", f"/api/collections/{name}", token=token)
        return True
    except Exception:
        return False


def ensure_collection(name, fields, token):
    if coll_exists(name, token):
        print(f"exists: {name}")
        return
    body = {
        "name": name,
        "type": "base",
        "fields": fields,
    }
    pb("POST", "/api/collections", body, token=token)
    print(f"created: {name}")


def ensure_list_item(list_key, value, token):
    filt = urllib.parse.quote(f'list_key="{list_key}" && value="{value}"')
    items = pb("GET", f"/api/collections/list_items/records?perPage=1&filter={filt}", token=token)["items"]
    if items:
        return
    pb("POST", "/api/collections/list_items/records", {
        "list_key": list_key,
        "value": value,
        "sort_order": 0,
        "active": True,
    }, token=token)
    print(f"list_items +{list_key}: {value}")


def main():
    env = load_env("/opt/itmen-pipeline/.env")
    token = pb("POST", "/api/admins/auth-with-password", {
        "identity": env["PB_ADMIN_EMAIL"],
        "password": env["PB_ADMIN_PASSWORD"],
    })["token"]

    text = lambda **kw: {"name": kw.get("name"), "type": "text", "required": kw.get("required", False),
                         "presentable": kw.get("presentable", False), "max": kw.get("max", 0)}
    number = lambda name: {"name": name, "type": "number", "required": False}

    company_fields = [
        {**text(name="norm_key", required=True, presentable=True), "unique": True},
        text(name="name", presentable=True, max=300),
        text(name="inn", max=20),
        text(name="kpp", max=20),
        text(name="ogrn", max=20),
        text(name="address", max=2000),
        number("amo_company_id"),
    ]
    contact_fields = [
        {**text(name="norm_key", required=True, presentable=True), "unique": True},
        text(name="name", presentable=True, max=200),
        text(name="email", max=200),
        text(name="phone", max=80),
        text(name="role", max=120),
        number("amo_contact_id"),
    ]

    ensure_collection("crm_companies", company_fields, token)
    ensure_collection("crm_contacts", contact_fields, token)
    ensure_list_item("distributors", "Нет дистрибьютора", token)


if __name__ == "__main__":
    main()
