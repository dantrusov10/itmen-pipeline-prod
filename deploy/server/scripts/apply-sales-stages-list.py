#!/usr/bin/env python3
"""Синхронизировать list_items stages и kanban_stages с канонической воронкой CRM."""
import json
import urllib.parse
import urllib.request

SALES_STAGES = [
    "Входящие лиды",
    "Взят в работу",
    "Встреча состоялась",
    "Интерес  Выявлен",
    "Подготовка Пилота",
    "Пилот",
    "Ожидаем отчет по итогам",
    "Пилот Окончен",
    "Предложение выслано",
    "Согласование бюджета",
    "Финальный компред",
    "Условия согласованы",
    "Документы подписаны",
    "Отгружен",
    "Успешно реализовано",
    "На паузе",
    "Отказ",
]

KANBAN_VISIBLE = [s for s in SALES_STAGES if s not in ("Отказ",)]


def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
    return env


def main():
    env = load_env("/opt/itmen-pipeline/.env")
    base = "http://127.0.0.1:8095"
    req = urllib.request.Request(
        f"{base}/api/admins/auth-with-password",
        data=json.dumps({
            "identity": env["PB_ADMIN_EMAIL"],
            "password": env["PB_ADMIN_PASSWORD"],
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.load(urllib.request.urlopen(req))["token"]
    headers = {"Authorization": token, "Content-Type": "application/json"}

    def pb(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw)

    def replace_list(list_key, values):
        filt = urllib.parse.quote(f'list_key="{list_key}"')
        items = pb("GET", f"/api/collections/list_items/records?perPage=500&filter={filt}")["items"]
        for row in items:
            pb("DELETE", f"/api/collections/list_items/records/{row['id']}")
        for i, val in enumerate(values):
            pb("POST", "/api/collections/list_items/records", {
                "list_key": list_key,
                "value": val,
                "sort_order": i,
                "active": True,
            })
        print(f"{list_key}: {len(values)} items")

    replace_list("stages", SALES_STAGES)

    filt = urllib.parse.quote('list_key="kanban_stages"')
    items = pb("GET", f"/api/collections/list_items/records?perPage=10&filter={filt}")["items"]
    body = {
        "list_key": "kanban_stages",
        "value": json.dumps(KANBAN_VISIBLE, ensure_ascii=False),
        "sort_order": 0,
        "active": True,
    }
    if items:
        pb("PATCH", f"/api/collections/list_items/records/{items[0]['id']}", body)
    else:
        pb("POST", "/api/collections/list_items/records", body)
    print(f"kanban_stages: {len(KANBAN_VISIBLE)} columns")


if __name__ == "__main__":
    main()
