#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Проверка защиты от массового перезатирания."""
import json
import urllib.error
import urllib.request

def req(url, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def load_pw(email_prefix):
    for line in open("/opt/itmen-pipeline/.pipeline-users.env"):
        if line.startswith(email_prefix):
            return line.split("=", 1)[1].strip()
    return None

def main():
    ok = True

    # 1. Manager cannot bulk PUT
    _, login = req("http://127.0.0.1:3010/api/auth/login", {
        "email": "merlein@itmen-pipeline.local",
        "password": load_pw("merlein@"),
    })
    mtok = login.get("token")
    code, body = req("http://127.0.0.1:3010/api/pipeline", {
        "state": {"deals": [{"id": "D-001", "customer": "HACK"}]},
        "forceFull": True,
    }, token=mtok, method="PUT")
    print(f"1. Manager PUT /api/pipeline: {code} — {'OK' if code == 403 else 'FAIL'}")
    ok &= code == 403

    # 2. Public PB write denied
    code2, _ = req("http://127.0.0.1:8095/api/collections/deals/records", {
        "deal_id": "HACK-999", "customer": "x",
    }, method="POST")
    print(f"2. Public POST deals: {code2} — {'OK' if code2 in (401, 403) else 'FAIL'}")
    ok &= code2 in (401, 403)

    # 3. Admin forceFull with too few deals rejected
    _, alogin = req("http://127.0.0.1:3010/api/auth/login", {
        "email": "admin@itmen-pipeline.local",
        "password": load_pw("admin@"),
    })
    atok = alogin.get("token")
    code3, body3 = req("http://127.0.0.1:3010/api/pipeline", {
        "state": {"deals": [{"id": "D-001", "customer": "Only one"}]},
        "forceFull": True,
        "baseDataEpoch": 1,
    }, token=atok, method="PUT")
    print(f"3. Admin forceFull 1 deal: {code3} — {'OK' if code3 == 409 else 'FAIL'}")
    if code3 != 409:
        print("   ", body3)
    ok &= code3 == 409

    # 4. GAS prod maintenance
    gas = "https://script.google.com/macros/s/AKfycbxsKycDe4W8RWlXmSWlQY6CJUnUbBoJxLSsL3uknJLPBgUA84GcrtV1Btlv_7_RCyldIA/exec"
    code4, body4 = req(gas, {"action": "save", "state": {"deals": []}, "forceFull": True}, method="POST")
    # GAS returns 200 with error in JSON
    err = body4.get("error", "")
    print(f"4. GAS prod save blocked: {'OK' if 'заблокировано' in err.lower() or 'maintenance' in err.lower() else 'CHECK'}")
    if err:
        print(f"   {err[:100]}")
    ok &= bool(err)

    # 5. Deal count unchanged (spot)
    _, pdata = req("http://127.0.0.1:3010/api/pipeline?lite=1", token=atok)
    n = len(pdata.get("state", {}).get("deals", []))
    print(f"5. Deals still on server: {n} — {'OK' if n >= 218 else 'FAIL'}")
    ok &= n >= 218

    print("\n" + ("✓ Все проверки пройдены" if ok else "⚠ Есть проблемы"))
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
