#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import urllib.error
import urllib.request

def load_pw(prefix):
    for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
        if line.startswith(prefix):
            return line.split("=", 1)[1].strip()

def req(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def login(email, pw):
    _, d = req("http://127.0.0.1:3010/api/auth/login", {"email": email, "password": pw})
    return d.get("token")

def main():
    tok = login("merlein@itmen-pipeline.local", load_pw("merlein@"))
    deal = {
        "id": "D-999",
        "customer": "TEST CREATE ANY OWNER",
        "owner": "Арслан Ахметшин",
        "stage": "Отказ",
        "industry": "Не определена",
        "dealType": "Текущий пайплайн",
        "amount": 0,
        "expectedBudget": 0,
        "budgetStatus": "Неизвестно",
        "scores": {},
        "techResearch": {},
    }
    code, body = req("http://127.0.0.1:3010/api/deals/D-999", {"deal": deal}, token=tok, method="PATCH")
    print("create for other owner:", code, body.get("deal", {}).get("id"), body.get("deal", {}).get("owner"), body.get("deal", {}).get("stage"))
    if code != 200:
        print(body)
        return 1
    # cleanup
    admin_tok = login("admin@itmen-pipeline.local", load_pw("admin@"))
    real_id = body["deal"]["id"]
    req(f"http://127.0.0.1:3010/api/deals/{real_id}", token=admin_tok, method="DELETE")
    print("cleaned up", real_id)
    # verify stages list
    _, pipe = req("http://127.0.0.1:3010/api/pipeline?lite=1", token=tok)
    stages = pipe.get("state", {}).get("lists", {}).get("stages", [])
    print("Отказ in stages:", "Отказ" in stages)
    return 0 if code == 200 and "Отказ" in stages else 1

if __name__ == "__main__":
    raise SystemExit(main())
